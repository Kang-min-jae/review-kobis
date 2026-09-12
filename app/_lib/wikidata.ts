// Wikidata SPARQL API 연동 — 세계 주요 영화제 최신 수상작 조회.
//
// 캐싱 계층:
//   1) 모듈 메모리 캐시 — 개발 핫리로드 중 중복 호출 방지 (5분 TTL)
//   2) DB 캐시(CachedAwardWinners) — 24시간 TTL, 배포 환경에서 Wikidata 반복 호출 방지
//   3) Wikidata SPARQL — 캐시가 없거나 만료됐을 때만 실제 호출
//
// 429 처리: Retry-After 헤더 우선 사용, 없으면 지수 백오프(3s → 9s → 27s), 최대 3회.
// TMDB ID: Wikidata P4947 프로퍼티로 TMDB 영화 ID를 같이 조회해 포스터 직접 접근.

import { db } from "./db";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

export type FestivalType = "academy" | "cannes" | "berlin" | "venice";

export type FestivalWinner = {
  categoryLabel: string;
  titleKo: string | null;
  titleEn: string;
  ceremonyYear: number;
  filmQid: string;
  tmdbId: string | null; // Wikidata P4947 — 포스터 직접 조회용
};

const FESTIVAL_FILTERS: Record<FestivalType, string> = {
  academy: `STRSTARTS(LCASE(?awardLabelEn), "academy award for")`,
  cannes: `(STRSTARTS(LCASE(?awardLabelEn), "palme") || CONTAINS(LCASE(?awardLabelEn), "cannes film festival"))`,
  berlin: `(STRSTARTS(LCASE(?awardLabelEn), "golden bear") || STRSTARTS(LCASE(?awardLabelEn), "silver bear"))`,
  venice: `(STRSTARTS(LCASE(?awardLabelEn), "golden lion") || STRSTARTS(LCASE(?awardLabelEn), "silver lion") || CONTAINS(LCASE(?awardLabelEn), "venice film festival") || CONTAINS(LCASE(?awardLabelEn), "volpi cup") || STRSTARTS(LCASE(?awardLabelEn), "marcello mastroianni"))`,
};

// ── SPARQL fetch (429 재시도 포함) ──────────────────────────────────────────
async function sparqlFetch(
  query: string,
  attempt = 1,
): Promise<Record<string, { value: string }>[]> {
  const url = new URL(SPARQL_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "review-kobis/1.0 (https://github.com/Kang-min-jae/review-kobis)",
      },
      signal: AbortSignal.timeout(40_000),
      cache: "no-store", // DB에서 캐싱하므로 fetch 캐시는 끈다
    });
  } catch (err) {
    console.warn(`[wikidata] SPARQL 네트워크 오류 (시도 ${attempt}):`, err);
    return [];
  }

  if (res.status === 429) {
    if (attempt > 3) {
      console.warn("[wikidata] 429 재시도 초과 — 포기");
      return [];
    }
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "0", 10);
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : 3 ** attempt * 1000;
    console.warn(`[wikidata] 429 — ${waitMs}ms 후 재시도 (${attempt}/3)`);
    await new Promise((r) => setTimeout(r, waitMs));
    return sparqlFetch(query, attempt + 1);
  }

  if (!res.ok) {
    console.warn(`[wikidata] SPARQL 요청 실패: HTTP ${res.status}`);
    return [];
  }

  try {
    const json = (await res.json()) as { results?: { bindings?: Record<string, { value: string }>[] } };
    return json.results?.bindings ?? [];
  } catch {
    return [];
  }
}

// ── SPARQL 쿼리 빌더 ─────────────────────────────────────────────────────────
function buildFilmLevelQuery(festivalFilter: string, sinceYear: number): string {
  return `
SELECT DISTINCT ?award ?awardLabelEn ?awardLabelKo ?film ?year ?filmLabelKo ?filmLabelEn ?tmdbId WHERE {
  ?film p:P166 ?stmt .
  ?stmt ps:P166 ?award .
  ?stmt pq:P585 ?date .
  FILTER NOT EXISTS { ?film wdt:P31 wd:Q5 }
  BIND(YEAR(?date) AS ?year)
  FILTER(?year >= ${sinceYear})
  ?award rdfs:label ?awardLabelEn FILTER(LANG(?awardLabelEn) = "en")
  FILTER(${festivalFilter})
  OPTIONAL { ?award rdfs:label ?awardLabelKo FILTER(LANG(?awardLabelKo) = "ko") }
  OPTIONAL { ?film rdfs:label ?filmLabelKo FILTER(LANG(?filmLabelKo) = "ko") }
  OPTIONAL { ?film rdfs:label ?filmLabelEn FILTER(LANG(?filmLabelEn) = "en") }
  OPTIONAL { ?film wdt:P4947 ?tmdbId }
}
ORDER BY ?award DESC(?year)
LIMIT 300
`.trim();
}

function buildPersonLevelQuery(festivalFilter: string, sinceYear: number): string {
  return `
SELECT DISTINCT ?award ?awardLabelEn ?awardLabelKo ?film ?year ?filmLabelKo ?filmLabelEn ?tmdbId WHERE {
  ?person p:P166 ?stmt .
  ?stmt ps:P166 ?award .
  ?stmt pq:P1686 ?film .
  ?stmt pq:P585 ?date .
  ?person wdt:P31 wd:Q5 .
  BIND(YEAR(?date) AS ?year)
  FILTER(?year >= ${sinceYear})
  ?award rdfs:label ?awardLabelEn FILTER(LANG(?awardLabelEn) = "en")
  FILTER(${festivalFilter})
  OPTIONAL { ?award rdfs:label ?awardLabelKo FILTER(LANG(?awardLabelKo) = "ko") }
  OPTIONAL { ?film rdfs:label ?filmLabelKo FILTER(LANG(?filmLabelKo) = "ko") }
  OPTIONAL { ?film rdfs:label ?filmLabelEn FILTER(LANG(?filmLabelEn) = "en") }
  OPTIONAL { ?film wdt:P4947 ?tmdbId }
}
ORDER BY ?award DESC(?year)
LIMIT 300
`.trim();
}

// ── 결과 파싱 ────────────────────────────────────────────────────────────────
type RawRow = Record<string, { value: string }>;

function shortenLabel(labelKo: string | null, labelEn: string): string {
  if (labelKo) {
    return labelKo
      .replace(/^아카데미\s+(시상식\s+)?/, "")
      .replace(/^칸\s+(국제\s+)?영화제\s+/, "")
      .replace(/^베를린\s+(국제\s+)?영화제\s+/, "")
      .replace(/^베니스\s+(국제\s+)?영화제\s+/, "")
      .trim() || labelKo;
  }
  return labelEn
    .replace(/^Academy Award for\s+/, "")
    .replace(/^Cannes Film Festival Award for\s+/, "")
    .replace(/\s*\(Cannes Film Festival\)$/, "")
    .replace(/\s*\(Berlinale\)$/, "")
    .replace(/\s*\(Venice Film Festival\)$/, "")
    .trim() || labelEn;
}

function parseQid(uri: string): string {
  return uri.split("/").pop() ?? "";
}

function rowsToMap(rows: RawRow[], map: Map<string, FestivalWinner>) {
  for (const row of rows) {
    const filmQid = parseQid(row.film?.value ?? "");
    const awardQid = parseQid(row.award?.value ?? "");
    const awardLabelEn = row.awardLabelEn?.value ?? "";
    const awardLabelKo = row.awardLabelKo?.value ?? null;
    const titleKo = row.filmLabelKo?.value ?? null;
    const titleEn = row.filmLabelEn?.value ?? "";
    const year = parseInt(row.year?.value ?? "0", 10);
    const tmdbId = row.tmdbId?.value ?? null;

    if (!filmQid || (!titleEn && !titleKo) || !awardQid || !year) continue;

    const existing = map.get(awardQid);
    if (!existing || year > existing.ceremonyYear) {
      map.set(awardQid, {
        filmQid,
        titleKo,
        titleEn: titleEn || titleKo!,
        categoryLabel: shortenLabel(awardLabelKo, awardLabelEn),
        ceremonyYear: year,
        tmdbId,
      });
    }
  }
}

async function fetchFestivalWinnersRaw(
  festivalFilter: string,
  sinceYear: number,
): Promise<FestivalWinner[]> {
  const [filmRows, personRows] = await Promise.all([
    sparqlFetch(buildFilmLevelQuery(festivalFilter, sinceYear)),
    sparqlFetch(buildPersonLevelQuery(festivalFilter, sinceYear)),
  ]);

  const byAward = new Map<string, FestivalWinner>();
  rowsToMap(filmRows, byAward);
  rowsToMap(personRows, byAward);

  return Array.from(byAward.values()).sort((a, b) =>
    a.categoryLabel.localeCompare(b.categoryLabel, "ko")
  );
}

// ── 캐싱 ────────────────────────────────────────────────────────────────────
// 버전을 올리면 기존 DB 캐시를 무시하고 Wikidata를 즉시 재조회한다.
const CACHE_VERSION = "v3";

// 개발 핫리로드 중 모듈이 재평가돼도 글로벌 객체에 붙여두면 유지된다
const MEM_TTL_MS = 60 * 60 * 1000; // 1시간 (시상식 데이터는 자주 안 바뀜)
type MemEntry = { data: FestivalWinner[]; at: number };
const g = globalThis as typeof globalThis & { __wikidataCache?: Map<string, MemEntry> };
if (!g.__wikidataCache) g.__wikidataCache = new Map<string, MemEntry>();
const memCache = g.__wikidataCache;

// 각 영화제 다음 시상식 예정 월 — 캐시 만료 기준
const CEREMONY_MONTHS: Record<FestivalType, number> = {
  academy: 3,  // 3월
  cannes:  5,  // 5월
  berlin:  2,  // 2월
  venice:  9,  // 9월
};

// 캐시된 maxYear 기준으로 다음 시상식 예정일 계산
function nextCeremonyDate(type: FestivalType, maxYear: number): Date {
  const m = CEREMONY_MONTHS[type];
  return new Date(`${maxYear + 1}-${String(m).padStart(2, "0")}-01T00:00:00Z`);
}

// 폴백은 Wikidata 연결 실패 시에만 사용된다. 최신 데이터는 항상 Wikidata에서 온다.
const FALLBACK_WINNERS: Record<FestivalType, FestivalWinner[]> = {
  // 97회 아카데미 시상식 (2025년 3월)
  academy: [
    { categoryLabel: "작품상",    titleKo: "아노라",        titleEn: "Anora",          ceremonyYear: 2025, filmQid: "Q125499906", tmdbId: "1209290" },
    { categoryLabel: "감독상",    titleKo: null,            titleEn: "The Brutalist",  ceremonyYear: 2025, filmQid: "Q108851477", tmdbId: "1023919" },
    { categoryLabel: "남우주연상", titleKo: null,            titleEn: "The Brutalist",  ceremonyYear: 2025, filmQid: "Q108851477", tmdbId: "1023919" },
    { categoryLabel: "여우주연상", titleKo: null,            titleEn: "The Substance",  ceremonyYear: 2025, filmQid: "Q125889440", tmdbId: "933260" },
    { categoryLabel: "국제영화상", titleKo: null,            titleEn: "I'm Still Here", ceremonyYear: 2025, filmQid: "Q128023745", tmdbId: "1156593" },
    { categoryLabel: "각본상",    titleKo: "아노라",        titleEn: "Anora",          ceremonyYear: 2025, filmQid: "Q125499906", tmdbId: "1209290" },
    { categoryLabel: "각색상",    titleKo: null,            titleEn: "Conclave",       ceremonyYear: 2025, filmQid: "Q128029218", tmdbId: "975902" },
  ],
  // 78회 칸 영화제 (2025년 5월) — Wikidata 재조회로 자동 반영
  cannes: [
    { categoryLabel: "황금종려상", titleKo: "아노라", titleEn: "Anora", ceremonyYear: 2024, filmQid: "Q125499906", tmdbId: "1209290" },
    { categoryLabel: "심사위원대상", titleKo: null, titleEn: "All We Imagine as Light", ceremonyYear: 2024, filmQid: "Q124949622", tmdbId: "1164659" },
  ],
  // 75회 베를린 영화제 (2025년 2월) — Wikidata 재조회로 자동 반영
  berlin: [
    { categoryLabel: "황금곰상", titleKo: null, titleEn: "Dahomey", ceremonyYear: 2024, filmQid: "Q130185185", tmdbId: "1239586" },
  ],
  // 82회 베니스 영화제 (2025년 9월) — Wikidata 재조회로 자동 반영
  venice: [
    { categoryLabel: "황금사자상",   titleKo: null, titleEn: "April",          ceremonyYear: 2024, filmQid: "Q124831397", tmdbId: "1226979" },
    { categoryLabel: "심사위원대상", titleKo: null, titleEn: "Vermiglio",       ceremonyYear: 2024, filmQid: "Q127028023", tmdbId: "1352009" },
    { categoryLabel: "감독상",       titleKo: null, titleEn: "The Brutalist",   ceremonyYear: 2024, filmQid: "Q108851477", tmdbId: "1023919" },
    { categoryLabel: "각본상",       titleKo: null, titleEn: "I'm Still Here",  ceremonyYear: 2024, filmQid: "Q128023745", tmdbId: "1156593" },
    { categoryLabel: "여우주연상",   titleKo: null, titleEn: "Babygirl",        ceremonyYear: 2024, filmQid: "Q128462534", tmdbId: "1037073" },
    { categoryLabel: "특별심사위원상", titleKo: null, titleEn: "Queer",         ceremonyYear: 2024, filmQid: "Q115030826", tmdbId: "539051" },
    { categoryLabel: "남우주연상",   titleKo: null, titleEn: "Vincent Must Die", ceremonyYear: 2024, filmQid: "Q122915012", tmdbId: "1179694" },
  ],
};

async function fetchWithCache(type: FestivalType, sinceYear: number): Promise<FestivalWinner[]> {
  const cacheKey = `${type}-${CACHE_VERSION}`;

  // 1) 메모리 캐시
  const mem = memCache.get(cacheKey);
  if (mem && Date.now() - mem.at < MEM_TTL_MS) return mem.data;

  // 2) DB 캐시 — 다음 시상식 예정일 전이면 무기한 사용
  try {
    const cached = await db.cachedAwardWinners.findUnique({ where: { id: cacheKey } });
    if (cached) {
      const winners = cached.winners as unknown as FestivalWinner[];
      if (winners.length > 0) {
        const maxYear = Math.max(...winners.map((w) => w.ceremonyYear));
        const next = nextCeremonyDate(type, maxYear);
        const now = Date.now();

        if (now < next.getTime()) {
          // 다음 시상식 전 — 재조회 불필요, 캐시 그대로 사용
          memCache.set(cacheKey, { data: winners, at: now });
          return winners;
        }
        if (cached.updatedAt.getTime() >= next.getTime()) {
          // 이미 시상식 이후에 한 번 갱신된 캐시 — 신규 데이터 반영됨
          memCache.set(cacheKey, { data: winners, at: now });
          return winners;
        }
        // 시상식 이후인데 캐시가 그 전 데이터 → 아래에서 Wikidata 재조회
        console.info(`[wikidata] ${type} 새 시상식 이후 — Wikidata 재조회`);
      }
    }
  } catch (err) {
    // P2021: 테이블 자체가 없음 → npx prisma db push 미실행 상태.
    if ((err as { code?: string }).code === "P2021") {
      console.warn("[wikidata] CachedAwardWinners 테이블 없음 — 폴백 사용 (npx prisma db push 필요)");
      const data = FALLBACK_WINNERS[type];
      memCache.set(cacheKey, { data, at: Date.now() });
      return data;
    }
    console.warn("[wikidata] DB 캐시 조회 실패:", err);
  }

  // 3) Wikidata SPARQL
  const raw = await fetchFestivalWinnersRaw(FESTIVAL_FILTERS[type], sinceYear);
  const data = raw.length > 0 ? raw : FALLBACK_WINNERS[type];

  // 4) DB에 저장
  try {
    await db.cachedAwardWinners.upsert({
      where: { id: cacheKey },
      create: { id: cacheKey, winners: data as unknown as object[] },
      update: { winners: data as unknown as object[] },
    });
  } catch (err) {
    console.warn("[wikidata] DB 캐시 저장 실패:", err);
  }

  memCache.set(cacheKey, { data, at: Date.now() });
  return data;
}

// ── 공개 API ─────────────────────────────────────────────────────────────────
// 최근 2년치만 조회 — 각 부문마다 가장 최신 연도를 자동으로 선택한다
const SINCE_YEAR = new Date().getFullYear() - 2;

export async function fetchLatestAcademyWinners(): Promise<FestivalWinner[]> {
  return fetchWithCache("academy", SINCE_YEAR);
}

export async function fetchLatestCannesWinners(): Promise<FestivalWinner[]> {
  return fetchWithCache("cannes", SINCE_YEAR);
}

export async function fetchLatestBerlinWinners(): Promise<FestivalWinner[]> {
  return fetchWithCache("berlin", SINCE_YEAR);
}

export async function fetchLatestVeniceWinners(): Promise<FestivalWinner[]> {
  return fetchWithCache("venice", SINCE_YEAR);
}
