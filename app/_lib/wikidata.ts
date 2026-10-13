// Wikidata SPARQL API 연동 — 세계 주요 영화제 최신 수상작 조회.
//
// 캐싱 계층:
//   1) 모듈 메모리 캐시 — 개발 핫리로드 중 중복 호출 방지 (5분 TTL)
//   2) DB 캐시(CachedAwardWinners) — 최근 회차가 들어 있으면 계속 사용, 없으면 6시간마다 재조회
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

// 영어 상 이름 → 한국어 부문명. Wikidata 한국어 라벨은 없거나 제각각("베네치아 국제 영화제 …")이라
// 아는 상은 이 표를 먼저 쓴다. 위에서부터 처음 맞는 규칙을 쓴다(더 구체적인 규칙을 위에 둔다).
const AWARD_LABEL_KO: [RegExp, string][] = [
  // 아카데미
  [/^academy award for best picture/, "작품상"],
  [/^academy award for best director/, "감독상"],
  [/^academy award for best supporting actor/, "남우조연상"],
  [/^academy award for best supporting actress/, "여우조연상"],
  [/^academy award for best actor/, "남우주연상"],
  [/^academy award for best actress/, "여우주연상"],
  [/^academy award for best original screenplay/, "각본상"],
  [/^academy award for best adapted screenplay/, "각색상"],
  [/^academy award for best international feature|^academy award for best foreign language film/, "국제장편영화상"],
  [/^academy award for best animated feature/, "장편애니메이션상"],
  [/^academy award for best animated short/, "단편애니메이션상"],
  [/^academy award for best documentary short/, "단편다큐멘터리상"],
  [/^academy award for best documentary/, "장편다큐멘터리상"],
  [/^academy award for best live action short/, "단편영화상"],
  [/^academy award for best cinematography/, "촬영상"],
  [/^academy award for best film editing/, "편집상"],
  [/^academy award for best original score/, "음악상"],
  [/^academy award for best original song/, "주제가상"],
  [/^academy award for best production design/, "미술상"],
  [/^academy award for best costume design/, "의상상"],
  [/^academy award for best makeup/, "분장상"],
  [/^academy award for best sound/, "음향상"],
  [/^academy award for best visual effects/, "시각효과상"],
  [/^academy award for best casting/, "캐스팅상"],
  // 칸
  [/short film palme/, "단편 황금종려상"],
  [/^palme d.or/, "황금종려상"],
  [/^grand prix.*cannes|^cannes.*grand prix/, "심사위원대상"],
  [/^cam[eé]ra d.or/, "황금카메라상"],
  [/cannes.*best director/, "감독상"],
  [/cannes.*best actor/, "남우주연상"],
  [/cannes.*best actress/, "여우주연상"],
  [/cannes.*best screenplay/, "각본상"],
  [/^jury prize.*cannes|cannes.*jury prize/, "심사위원상"],
  [/cannes.*special (award|prize)/, "특별상"],
  // 베를린
  [/^golden bear/, "황금곰상"],
  [/^silver bear.*grand jury/, "심사위원대상"],
  [/^silver bear.*director/, "감독상"],
  [/^silver bear.*supporting/, "조연상"],
  [/^silver bear.*leading performance/, "주연상"],
  [/^silver bear.*best actor/, "남우주연상"],
  [/^silver bear.*best actress/, "여우주연상"],
  [/^silver bear.*screenplay/, "각본상"],
  [/^silver bear.*artistic contribution/, "예술공헌상"],
  [/^silver bear.*jury prize/, "심사위원상"],
  // 베니스
  [/^golden lion/, "황금사자상"],
  [/grand jury prize.*venice|venice.*grand jury|^silver lion.*grand jury/, "심사위원대상"],
  [/^silver lion/, "감독상"],
  [/^volpi cup.*actress/, "여우주연상"],
  [/^volpi cup.*actor/, "남우주연상"],
  [/venice.*best screenplay|^golden osella.*screenplay/, "각본상"],
  [/special jury prize.*venice|venice.*special jury/, "특별심사위원상"],
  [/^marcello mastroianni/, "신인배우상"],
  [/lion of the future|luigi de laurentiis/, "신인감독상"],
];

export function koreanAwardLabel(labelEn: string): string | null {
  const s = labelEn.toLowerCase().trim();
  for (const [pattern, label] of AWARD_LABEL_KO) if (pattern.test(s)) return label;
  return null;
}

function shortenLabel(labelKo: string | null, labelEn: string): string {
  const mapped = koreanAwardLabel(labelEn);
  if (mapped) return mapped;
  if (labelKo) {
    return labelKo
      .replace(/^아카데미\s+(시상식\s+)?/, "")
      .replace(/^칸\s+(국제\s+)?영화제\s+/, "")
      .replace(/^베를린\s+(국제\s+)?영화제\s+/, "")
      .replace(/^(베니스|베네치아)\s+(국제\s+)?영화제\s+/, "")
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

  return onlyLatestCeremony(Array.from(byAward.values()));
}

// 가장 최근 회차(연도)의 수상작만 남긴다. 예전엔 부문마다 "그 부문의 가장 최근 수상작"을 골라서,
// Wikidata에 아직 올해 기록이 없는 부문은 작년 수상작이 올해 수상작과 섞여 보였다.
export function onlyLatestCeremony(winners: FestivalWinner[]): FestivalWinner[] {
  if (winners.length === 0) return [];
  const latestYear = Math.max(...winners.map((w) => w.ceremonyYear));
  const rank = (label: string) => {
    const i = CATEGORY_ORDER.indexOf(label);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return winners
    .filter((w) => w.ceremonyYear === latestYear)
    .sort((a, b) => rank(a.categoryLabel) - rank(b.categoryLabel) || a.categoryLabel.localeCompare(b.categoryLabel, "ko"));
}

// 수상작 칸의 카드 순서 — 최고상부터.
const CATEGORY_ORDER = [
  "작품상", "황금종려상", "황금곰상", "황금사자상", "심사위원대상", "감독상", "남우주연상", "여우주연상", "주연상",
  "남우조연상", "여우조연상", "조연상", "각본상", "각색상", "심사위원상", "특별심사위원상", "국제장편영화상", "장편애니메이션상",
];

// ── 캐싱 ────────────────────────────────────────────────────────────────────
// 버전을 올리면 기존 DB 캐시와 unstable_cache 키 양쪽을 무효화한다.
// v7: 최근 회차만 남기도록 바꾸고, 시상식이 끝나도 옛 수상작에서 갱신되지 않던 캐시를 버린다.
// v8: 상 이름 한국어 표(AWARD_LABEL_KO) 적용 + 직접 확인한 목록과 합치기.
export const CACHE_VERSION = "v8";

// 개발 핫리로드 중 모듈이 재평가돼도 글로벌 객체에 붙여두면 유지된다
const MEM_TTL_MS = 60 * 60 * 1000; // 1시간 (시상식 데이터는 자주 안 바뀜)
type MemEntry = { data: FestivalWinner[]; at: number };
const g = globalThis as typeof globalThis & { __wikidataCache?: Map<string, MemEntry> };
if (!g.__wikidataCache) g.__wikidataCache = new Map<string, MemEntry>();
const memCache = g.__wikidataCache;

// 각 영화제 "수상 결과가 나와 Wikidata에 반영될 만한" 날짜(UTC, 대략 폐막 며칠 뒤).
// 예전엔 시상식 "달의 1일"을 기준으로 다시 조회해서, 결과가 나오기 전 데이터를 받은 뒤
// "이미 갱신됨"으로 판단해 다음 해까지 옛 수상작에 머무는 문제가 있었다.
const RESULTS_AVAILABLE: Record<FestivalType, { month: number; day: number }> = {
  academy: { month: 3, day: 20 }, // 3월 중순 시상식
  cannes: { month: 5, day: 31 }, // 5월 하순 폐막
  berlin: { month: 2, day: 28 }, // 2월 하순 폐막
  venice: { month: 9, day: 12 }, // 9월 초 폐막
};

// 지금 기준으로 "이미 결과가 나왔어야 할" 가장 최근 회차의 연도.
export function expectedLatestCeremonyYear(type: FestivalType, now: Date = new Date()): number {
  const year = now.getUTCFullYear();
  const { month, day } = RESULTS_AVAILABLE[type];
  const resultsAt = Date.UTC(year, month - 1, day);
  return now.getTime() >= resultsAt ? year : year - 1;
}

// 최근 회차 데이터가 아직 없을 때 Wikidata에 다시 묻는 최소 간격 — 반영이 늦어도 매 요청마다 묻지 않는다.
const REFETCH_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// 직접 확인해 넣어 둔 수상작 목록. 두 가지로 쓴다.
//  1) Wikidata 연결이 안 될 때의 폴백
//  2) Wikidata에 최근 회차가 일부만 올라와 있을 때의 보충 — 같은 회차면 이 목록을 우선해 합친다
//     (예: 2026 베니스는 Wikidata에 남우주연상만 있어 수상작 칸이 1편만 보였다).
// 새 회차가 끝나면 여기에 추가해 두면 Wikidata 반영 전에도 바로 보인다.
// tmdbId는 힌트일 뿐이다 — award-winners.ts가 제목·개봉연도로 검증한 뒤에만 쓴다.
const CURATED_WINNERS: Record<FestivalType, FestivalWinner[]> = {
  // 97회 아카데미 시상식 (2025년 3월)
  academy: [
    { categoryLabel: "작품상",    titleKo: "아노라",        titleEn: "Anora",          ceremonyYear: 2025, filmQid: "Q125499906", tmdbId: "1064213"  }, // Anora (2024)
    { categoryLabel: "감독상",    titleKo: null,            titleEn: "The Brutalist",  ceremonyYear: 2025, filmQid: "Q108851477", tmdbId: "549509"   }, // The Brutalist (2024)
    { categoryLabel: "남우주연상", titleKo: null,            titleEn: "The Brutalist",  ceremonyYear: 2025, filmQid: "Q108851477", tmdbId: "549509"   }, // The Brutalist (2024)
    { categoryLabel: "여우주연상", titleKo: null,            titleEn: "The Substance",  ceremonyYear: 2025, filmQid: "Q125889440", tmdbId: "933260"   }, // The Substance (2024)
    { categoryLabel: "국제영화상", titleKo: null,            titleEn: "I'm Still Here", ceremonyYear: 2025, filmQid: "Q128023745", tmdbId: "1000837"  }, // Ainda Estou Aqui (2024)
    { categoryLabel: "각본상",    titleKo: "아노라",        titleEn: "Anora",          ceremonyYear: 2025, filmQid: "Q125499906", tmdbId: "1064213"  }, // Anora (2024)
    { categoryLabel: "각색상",    titleKo: null,            titleEn: "Conclave",       ceremonyYear: 2025, filmQid: "Q128029218", tmdbId: "974576"   }, // Conclave (2024)
  ],
  // 78회 칸 영화제 (2025년 5월) — Wikidata 재조회로 자동 반영
  cannes: [
    { categoryLabel: "황금종려상", titleKo: "아노라", titleEn: "Anora", ceremonyYear: 2024, filmQid: "Q125499906", tmdbId: "1064213" },
    { categoryLabel: "심사위원대상", titleKo: null, titleEn: "All We Imagine as Light", ceremonyYear: 2024, filmQid: "Q124949622", tmdbId: "1164659" },
  ],
  // 75회 베를린 영화제 (2025년 2월) — Wikidata 재조회로 자동 반영
  berlin: [
    { categoryLabel: "황금곰상", titleKo: null, titleEn: "Dahomey", ceremonyYear: 2024, filmQid: "Q130185185", tmdbId: "1239586" },
  ],
  // 83회 베니스 영화제 (2026년 9월) — Wikidata 재조회로 자동 반영
  venice: [
    { categoryLabel: "황금사자상",     titleKo: null,        titleEn: "Woman Unknown",       ceremonyYear: 2026, filmQid: "Q140743054", tmdbId: "1511780" },
    { categoryLabel: "심사위원대상",   titleKo: "가능한 사랑", titleEn: "Possible Love",       ceremonyYear: 2026, filmQid: "Q137843740", tmdbId: "1483525" },
    { categoryLabel: "감독상",         titleKo: null,        titleEn: "DAU",                 ceremonyYear: 2026, filmQid: "Q140676305", tmdbId: null },
    { categoryLabel: "각본상",         titleKo: null,        titleEn: "A Good Little Soldier", ceremonyYear: 2026, filmQid: "Q140680910", tmdbId: "1430815" },
    { categoryLabel: "여우주연상",     titleKo: null,        titleEn: "Woman Unknown",       ceremonyYear: 2026, filmQid: "Q140743054", tmdbId: "1511780" },
    { categoryLabel: "남우주연상",     titleKo: null,        titleEn: "Wild Horse Nine",     ceremonyYear: 2026, filmQid: "Q133341572", tmdbId: "891621" },
    { categoryLabel: "특별심사위원상", titleKo: null,        titleEn: "NAZA",                ceremonyYear: 2026, filmQid: "Q141168534", tmdbId: "1755291" },
  ],
};

async function fetchWithCache(type: FestivalType, sinceYear: number): Promise<FestivalWinner[]> {
  const cacheKey = `${type}-${CACHE_VERSION}`;
  const expectedYear = expectedLatestCeremonyYear(type);

  // 1) 메모리 캐시
  const mem = memCache.get(cacheKey);
  if (mem && Date.now() - mem.at < MEM_TTL_MS) return mem.data;

  // 2) DB 캐시 — 최근 회차가 들어 있으면 그대로, 아니면 6시간에 한 번만 Wikidata에 다시 묻는다
  let cachedWinners: FestivalWinner[] | null = null;
  try {
    const cached = await db.cachedAwardWinners.findUnique({ where: { id: cacheKey } });
    if (cached) {
      const winners = onlyLatestCeremony(cached.winners as unknown as FestivalWinner[]);
      if (winners.length > 0) {
        cachedWinners = winners;
        const cachedYear = winners[0].ceremonyYear;
        const recentlyChecked = Date.now() - cached.updatedAt.getTime() < REFETCH_COOLDOWN_MS;
        if (cachedYear >= expectedYear || recentlyChecked) {
          memCache.set(cacheKey, { data: winners, at: Date.now() });
          return winners;
        }
        console.info(`[wikidata] ${type} ${expectedYear}년 회차 데이터 없음(캐시 ${cachedYear}년) — Wikidata 재조회`);
      }
    }
  } catch (err) {
    // P2021: 테이블 자체가 없음 → npx prisma db push 미실행 상태.
    if ((err as { code?: string }).code === "P2021") {
      console.warn("[wikidata] CachedAwardWinners 테이블 없음 — 폴백 사용 (npx prisma db push 필요)");
      const data = onlyLatestCeremony(CURATED_WINNERS[type]);
      memCache.set(cacheKey, { data, at: Date.now() });
      return data;
    }
    console.warn("[wikidata] DB 캐시 조회 실패:", err);
  }

  // 3) Wikidata SPARQL
  const raw = await fetchFestivalWinnersRaw(FESTIVAL_FILTERS[type], sinceYear).catch(() => []);
  if (raw.length === 0) {
    // 조회 실패 — 예전 캐시가 있으면 그걸, 없으면 폴백을 쓰되 DB엔 저장하지 않는다(다음에 다시 시도).
    const data = cachedWinners ?? onlyLatestCeremony(CURATED_WINNERS[type]);
    memCache.set(cacheKey, { data, at: Date.now() });
    return data;
  }

  // 새로 받은 게 캐시보다 옛 회차면(드문 일) 캐시를 유지한다.
  const data = cachedWinners && cachedWinners[0].ceremonyYear > raw[0].ceremonyYear ? cachedWinners : raw;

  // 4) DB에 저장 — updatedAt이 갱신돼 6시간 재조회 간격의 기준이 된다
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

// ── 공개 API — 홈 화면용 최신 수상작 ────────────────────────────────────────
// 최근 2년치만 조회한 뒤 가장 최근 회차(연도)만 남긴다. 서버가 해를 넘겨 떠 있어도 맞도록 매번 계산한다.
const sinceYear = () => new Date().getUTCFullYear() - 2;

// Wikidata 결과와 직접 확인한 목록을 합쳐 최근 회차만 남긴다. 같은 회차·같은 부문이면 직접 확인한
// 목록을 쓴다(한국어 제목·검증된 영화). 한쪽이 더 최근 회차면 그쪽만 남는다.
export function mergeWithCurated(type: FestivalType, wikidata: FestivalWinner[]): FestivalWinner[] {
  const curated = CURATED_WINNERS[type];
  const all = [...curated, ...wikidata];
  if (all.length === 0) return [];
  const latestYear = Math.max(...all.map((w) => w.ceremonyYear));
  const byCategory = new Map<string, FestivalWinner>();
  for (const w of all) {
    if (w.ceremonyYear !== latestYear) continue;
    if (!byCategory.has(w.categoryLabel)) byCategory.set(w.categoryLabel, w); // curated가 앞이라 우선
  }
  return onlyLatestCeremony([...byCategory.values()]);
}

async function fetchLatest(type: FestivalType): Promise<FestivalWinner[]> {
  return mergeWithCurated(type, await fetchWithCache(type, sinceYear()));
}

export async function fetchLatestAcademyWinners(): Promise<FestivalWinner[]> {
  return fetchLatest("academy");
}

export async function fetchLatestCannesWinners(): Promise<FestivalWinner[]> {
  return fetchLatest("cannes");
}

export async function fetchLatestBerlinWinners(): Promise<FestivalWinner[]> {
  return fetchLatest("berlin");
}

export async function fetchLatestVeniceWinners(): Promise<FestivalWinner[]> {
  return fetchLatest("venice");
}

// ── 특정 영화의 수상 이력 조회 ────────────────────────────────────────────────
// tmdbId로 Wikidata에서 해당 영화가 받은 모든 4대 영화제 수상 이력을 가져온다.
// rowsToMap과 달리 부문별 중복 제거 없이 ALL 수상작을 반환한다.

export type MovieAwardEntry = {
  festivalId: FestivalType;
  categoryLabel: string;
  ceremonyYear: number;
};

const ALL_FESTIVALS_FILTER = `(
  STRSTARTS(LCASE(?awardLabelEn), "academy award for") ||
  STRSTARTS(LCASE(?awardLabelEn), "palme") ||
  CONTAINS(LCASE(?awardLabelEn), "cannes film festival") ||
  STRSTARTS(LCASE(?awardLabelEn), "golden bear") ||
  STRSTARTS(LCASE(?awardLabelEn), "silver bear") ||
  STRSTARTS(LCASE(?awardLabelEn), "golden lion") ||
  STRSTARTS(LCASE(?awardLabelEn), "silver lion") ||
  CONTAINS(LCASE(?awardLabelEn), "venice film festival") ||
  CONTAINS(LCASE(?awardLabelEn), "volpi cup") ||
  STRSTARTS(LCASE(?awardLabelEn), "marcello mastroianni")
)`;

function detectFestival(awardLabelEn: string): FestivalType | null {
  const s = awardLabelEn.toLowerCase();
  if (s.startsWith("academy award for")) return "academy";
  if (s.startsWith("palme") || s.includes("cannes film festival")) return "cannes";
  if (s.startsWith("golden bear") || s.startsWith("silver bear")) return "berlin";
  if (
    s.startsWith("golden lion") ||
    s.startsWith("silver lion") ||
    s.includes("venice film festival") ||
    s.includes("volpi cup") ||
    s.startsWith("marcello mastroianni")
  ) return "venice";
  return null;
}

// 영화 하나의 수상 이력 조회 SPARQL. filmClause로 영화를 찾는 방법(TMDB ID / 영문 제목 /
// 한국어 제목)만 바꿔 끼운다. 신작은 수상 기록에 수상 시점(P585)이 아직 없는 경우가 많아
// 필수로 두면 통째로 빠진다 — 시점은 선택으로 받고, 없으면 시상식 항목(P805)의 시점,
// 그것도 없으면 영화 개봉일(P577) 연도로 채운다(연도 계산은 parseMovieAwardRows에서).
function buildMovieAwardsQueryFor(filmClause: string): string {
  return `
SELECT DISTINCT ?award ?awardLabelEn ?awardLabelKo ?date ?evDate ?pub WHERE {
  ${filmClause}
  {
    ?film p:P166 ?stmt .
  } UNION {
    ?person p:P166 ?stmt .
    ?stmt pq:P1686 ?film .
    ?person wdt:P31 wd:Q5 .
  }
  ?stmt ps:P166 ?award .
  OPTIONAL { ?stmt pq:P585 ?date }
  OPTIONAL { ?stmt pq:P805 ?event . ?event wdt:P585 ?evDate }
  OPTIONAL { ?film wdt:P577 ?pub }
  ?award rdfs:label ?awardLabelEn FILTER(LANG(?awardLabelEn) = "en")
  FILTER${ALL_FESTIVALS_FILTER}
  OPTIONAL { ?award rdfs:label ?awardLabelKo FILTER(LANG(?awardLabelKo) = "ko") }
}
LIMIT 200
`.trim();
}

function escapeSparqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildMovieAwardsQuery(tmdbId: string): string {
  return buildMovieAwardsQueryFor(`?film wdt:P4947 "${escapeSparqlString(tmdbId)}" .`);
}

// 영화 제목으로 조회하는 SPARQL 쿼리 (tmdbId로 못 찾을 때 폴백)
function buildMovieAwardsByTitleQuery(titleEn: string): string {
  return buildMovieAwardsQueryFor(`?film rdfs:label "${escapeSparqlString(titleEn)}"@en .
  FILTER NOT EXISTS { ?film wdt:P31 wd:Q5 }`);
}

// 한국어 제목 폴백 — 한국 영화는 Wikidata에 TMDB ID가 아직 없거나 영문 표기가 KOBIS와
// 다른 경우가 많다. 사람·드라마 등과 겹치지 않게 영화 계열 항목으로만 좁힌다.
function buildMovieAwardsByKoTitleQuery(titleKo: string): string {
  return buildMovieAwardsQueryFor(`?film rdfs:label "${escapeSparqlString(titleKo)}"@ko .
  VALUES ?filmType { wd:Q11424 wd:Q24869 wd:Q202866 wd:Q93204 }
  ?film wdt:P31 ?filmType .`);
}

function yearOf(value: string | undefined): number | null {
  if (!value) return null;
  const year = parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) && year > 1800 ? year : null;
}

function parseMovieAwardRows(rows: RawRow[]): MovieAwardEntry[] {
  // 같은 상이 개봉일 여러 개 등으로 여러 행이 될 수 있어 상(award)별로 모아 연도를 정한다.
  const byAward = new Map<string, { en: string; ko: string | null; dates: number[]; eventDates: number[]; pubs: number[] }>();
  for (const row of rows) {
    const awardLabelEn = row.awardLabelEn?.value ?? "";
    if (!awardLabelEn) continue;
    const key = row.award?.value ?? awardLabelEn;
    const entry = byAward.get(key) ?? { en: awardLabelEn, ko: row.awardLabelKo?.value ?? null, dates: [], eventDates: [], pubs: [] };
    const d = yearOf(row.date?.value), e = yearOf(row.evDate?.value), p = yearOf(row.pub?.value);
    if (d) entry.dates.push(d);
    if (e) entry.eventDates.push(e);
    if (p) entry.pubs.push(p);
    if (!entry.ko && row.awardLabelKo?.value) entry.ko = row.awardLabelKo.value;
    byAward.set(key, entry);
  }

  const seen = new Set<string>();
  const entries: MovieAwardEntry[] = [];
  for (const { en, ko, dates, eventDates, pubs } of byAward.values()) {
    const festivalId = detectFestival(en);
    if (!festivalId) continue;
    const pool = dates.length > 0 ? dates : eventDates.length > 0 ? eventDates : pubs;
    if (pool.length === 0) continue;
    const year = Math.min(...pool);
    const categoryLabel = shortenLabel(ko, en);
    const key = `${festivalId}-${year}-${categoryLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ festivalId, categoryLabel, ceremonyYear: year });
  }
  return entries;
}

// 영화별 수상 이력 메모리 캐시 (7일 TTL — 수상 이력은 거의 안 바뀜)
const MOVIE_AWARD_MEM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const gMovieAwards = globalThis as typeof globalThis & {
  __movieAwardsCache?: Map<string, { data: MovieAwardEntry[]; at: number }>;
};
if (!gMovieAwards.__movieAwardsCache) {
  gMovieAwards.__movieAwardsCache = new Map();
}
const movieAwardsMemCache = gMovieAwards.__movieAwardsCache;

// 캐시된 수상 이력도 이 기간이 지나면 다시 조회한다 — 신작은 Wikidata에 수상 기록이
// 나중에 추가되는 경우가 많은데, 예전엔 한 번 저장되면 영원히 갱신되지 않았다.
const MOVIE_AWARD_DB_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function fetchMovieAwardWins(
  tmdbId: string | null,
  titleEn: string | null,
  titleKo: string | null = null,
): Promise<MovieAwardEntry[]> {
  const cacheKey = tmdbId
    ? `movie-tmdb-${tmdbId}`
    : titleEn
      ? `movie-title-${titleEn.toLowerCase()}`
      : titleKo
        ? `movie-title-ko-${titleKo}`
        : null;
  if (!cacheKey) return [];

  // 1) 메모리 캐시 — 빈 결과는 잘못된 tmdbId로 인한 캐시일 수 있어 재조회
  const mem = movieAwardsMemCache.get(cacheKey);
  if (mem && mem.data.length > 0 && Date.now() - mem.at < MOVIE_AWARD_MEM_TTL_MS) return mem.data;

  // 2) DB 캐시 (CachedAwardWinners 테이블 재사용). 빈 결과는 신뢰하지 않고 재조회하고,
  // 오래된 결과는 다시 조회하되 새 조회가 비면 기존 값을 그대로 쓴다.
  let stale: MovieAwardEntry[] = [];
  try {
    const cached = await db.cachedAwardWinners.findUnique({ where: { id: cacheKey } });
    if (cached) {
      const data = cached.winners as unknown as MovieAwardEntry[];
      if (data.length > 0) {
        if (Date.now() - cached.updatedAt.getTime() < MOVIE_AWARD_DB_TTL_MS) {
          movieAwardsMemCache.set(cacheKey, { data, at: Date.now() });
          return data;
        }
        stale = data;
      }
    }
  } catch {
    // 테이블 없으면 통과
  }

  // 3) Wikidata SPARQL — TMDB ID → 영문 제목 → 한국어 제목 순으로, 결과가 나올 때까지
  let rows: Record<string, { value: string }>[] = [];
  if (tmdbId) rows = await sparqlFetch(buildMovieAwardsQuery(tmdbId));
  if (rows.length === 0 && titleEn) rows = await sparqlFetch(buildMovieAwardsByTitleQuery(titleEn));
  if (rows.length === 0 && titleKo) rows = await sparqlFetch(buildMovieAwardsByKoTitleQuery(titleKo));

  const fresh = parseMovieAwardRows(rows);
  const data = fresh.length > 0 ? fresh : stale;

  // 4) DB 캐시 저장
  try {
    await db.cachedAwardWinners.upsert({
      where: { id: cacheKey },
      create: { id: cacheKey, winners: data as unknown as object[] },
      update: { winners: data as unknown as object[] },
    });
  } catch {
    // 저장 실패는 무시 — 다음 요청 때 다시 시도
  }

  movieAwardsMemCache.set(cacheKey, { data, at: Date.now() });
  return data;
}
