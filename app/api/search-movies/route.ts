import { NextResponse } from "next/server";
import { searchMoviesSince1960, searchKoficPeopleList, type KobisSearchHit } from "../../_lib/kobis";
import { searchKmdbPeople, searchKmdbFilmography, suggestSimilarTitle, type KmdbPersonHit } from "../../_lib/kmdb";
import { getMovieMetas } from "../../_lib/movie-rate-info";
import { searchTmdbMulti, searchTmdbPerson } from "../../_lib/tmdb";
import { db } from "../../_lib/db";
import { koreanSimilarity, FUZZY_THRESHOLD } from "../../_lib/fuzzySearch";

// ── 결과 타입 ─────────────────────────────────────────────────────────────────

type MovieHit = KobisSearchHit & { posterUrl: string | null };

// ── 제목 정규화 ───────────────────────────────────────────────────────────────
// "&", "-", 공백, 괄호, 쉼표 등을 제거해 "미스터 & 미세스 스미스"와
// "미스터미세스스미스"가 동일하게 검색되게 한다. DB contains 조건에 병행 적용.
function normalizeForSearch(q: string): string {
  return q.replace(/[\s&\-,()（）·:：'"]/g, "").toLowerCase();
}

function tokenizeQuery(q: string): string[] {
  return q.trim().split(/\s+/).filter((t) => t.length > 0);
}

// ── 서버 인메모리 LRU 캐시 (2분 TTL, 최대 300개) ──────────────────────────────
// 서버리스 환경에서도 요청 간 모듈 상태가 유지되는 동안 살아있어, 같은 쿼리를
// 짧은 간격으로 반복해서 보낼 때 외부 API를 다시 호출하지 않고 즉시 응답한다.

type CacheEntry = { data: object; expiresAt: number };
const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2분
const CACHE_MAX_SIZE = 300;

function getCached(key: string): object | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    searchCache.delete(key);
    return null;
  }
  // LRU: 접근할 때 끝으로 이동
  searchCache.delete(key);
  searchCache.set(key, entry);
  return entry.data;
}

function setCache(key: string, data: object) {
  // 용량 초과 시 가장 오래된 항목(Map 순서의 첫 번째)을 제거
  if (searchCache.size >= CACHE_MAX_SIZE) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) searchCache.delete(oldest);
  }
  searchCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── 동시 Upsert 제한 (DB 커넥션 풀 보호) ────────────────────────────────────
// 백그라운드 저장이 동시에 폭주하면 Prisma 커넥션 풀(기본 10~15개)이 고갈되어
// 평점 저장·로그인 등 실시간 쿼리가 500 에러를 낼 수 있다.
// 최대 3개 동시 실행으로 제한해 주요 DB 쿼리가 영향받지 않게 한다.
class ConcurrencyLimiter {
  private running = 0;
  private readonly queue: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      this.queue.shift()?.();
    }
  }
}
const upsertLimiter = new ConcurrencyLimiter(3);

// ── 포스터 배치 조회 ──────────────────────────────────────────────────────────
async function withPosters(hits: KobisSearchHit[], locale = "ko"): Promise<MovieHit[]> {
  if (hits.length === 0) return [];
  const metas = await getMovieMetas(hits.map((h) => h.movieCd), locale);
  return hits.map((hit) => ({ ...hit, posterUrl: metas.get(hit.movieCd)?.posterUrl ?? null }));
}

// ── DB 영화 검색 (정규화 쿼리 병행) ──────────────────────────────────────────
// 원본 쿼리와 정규화 쿼리(공백·특수문자 제거) 두 가지로 동시에 contains 검색한다.
async function searchCachedMovies(query: string): Promise<MovieHit[]> {
  const normalized = normalizeForSearch(query);
  const tokens = tokenizeQuery(query);

  // DB-level OR: original + normalized (no-space) + each token individually
  // → broad fetch so in-memory post-filter can apply stricter AND logic
  const orConditions: object[] = [{ title: { contains: query, mode: "insensitive" } }];
  if (normalized !== query.toLowerCase()) {
    orConditions.push({ title: { contains: normalized, mode: "insensitive" } });
  }
  for (const token of tokens) {
    if (token.length >= 2) {
      orConditions.push({ title: { contains: token, mode: "insensitive" } });
    }
  }

  const rows = await db.cachedMovie.findMany({
    where: { OR: orConditions },
    select: { movieCd: true, title: true, releaseDate: true, posterUrl: true },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });

  // In-memory post-filter: keep only results that match by either strategy
  // Strategy A (no-space): normalizedTitle contains normalizedQuery (or vice-versa)
  // Strategy B (tokenized AND): every token appears in normalizedTitle
  const normalizedTokens = tokens.map(normalizeForSearch).filter((t) => t.length > 0);
  const filtered = rows.filter((r) => {
    const nt = normalizeForSearch(r.title);
    if (normalized.length >= 2 && (nt.includes(normalized) || normalized.includes(nt))) return true;
    if (normalizedTokens.length >= 2 && normalizedTokens.every((t) => nt.includes(t))) return true;
    return false;
  });

  return filtered
    .filter((r) => r.movieCd && !r.movieCd.startsWith("wikidata-"))
    .slice(0, 10)
    .map((r) => ({
      movieCd: r.movieCd,
      title: r.title,
      releaseDate: r.releaseDate,
      genre: null,
      posterUrl: r.posterUrl,
    }));
}

// ── DB 인물 검색 (한글명 + 영문명) ───────────────────────────────────────────
async function searchCachedPeople(query: string): Promise<Array<KmdbPersonHit & { tmdbId?: string }>> {
  const rows = await db.cachedPerson.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { nameEn: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { kmdbId: true, name: true, role: true, tmdbId: true },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });
  return rows.map((r) => ({
    kmdbId: r.kmdbId,
    name: r.name,
    role: r.role as "감독" | "배우",
    creditCount: 0,
    latestYear: null,
    tmdbId: r.tmdbId ?? undefined,
  }));
}

// ── KOFIC 대표작 붙이기 ───────────────────────────────────────────────────────
// KOFIC API 지연이 전체 검색 응답을 블로킹하지 않도록 800ms 타임아웃을 건다.
// 시간 초과 시 representativeWorks를 빈 배열로 내려보내고 계속 진행한다.
const KOFIC_TIMEOUT_MS = 800;

async function withRepresentativeWorks(
  people: KmdbPersonHit[]
): Promise<(KmdbPersonHit & { representativeWorks: string[] })[]> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("kofic_timeout")), KOFIC_TIMEOUT_MS)
  );
  try {
    return await Promise.race([
      Promise.all(
        people.map(async (person) => {
          const koficHits = await searchKoficPeopleList(person.name);
          const sameName = koficHits.filter((h) => h.name === person.name);
          if (sameName.length !== 1) return { ...person, representativeWorks: [] };
          return { ...person, representativeWorks: sameName[0].filmoNames.slice(0, 3) };
        })
      ),
      timeout,
    ]);
  } catch {
    return people.map((p) => ({ ...p, representativeWorks: [] }));
  }
}

// ── PersonIdentityMapping 보정 ────────────────────────────────────────────────
async function withIdentityMappingOverride(people: KmdbPersonHit[], query: string): Promise<KmdbPersonHit[]> {
  const mappings = await db.personIdentityMapping.findMany();
  const matching = mappings.filter(
    (m) => m.kmdbId && (m.personName.includes(query) || query.includes(m.personName))
  );
  if (matching.length === 0) return people;

  let result = people;
  for (const mapping of matching) {
    const role = mapping.role as "감독" | "배우";
    const kmdbId = mapping.kmdbId!;
    const nameIdx = result.findIndex((p) => p.name === mapping.personName && p.role === role);
    if (nameIdx !== -1 && result[nameIdx].kmdbId === kmdbId) continue;

    const movies = await searchKmdbFilmography(mapping.personName, kmdbId, role);
    const years = movies.map((m) => m.prodYear).filter((y): y is string => !!y);
    const latestYear = years.length > 0 ? years.reduce((a, b) => (a > b ? a : b)) : null;
    const corrected: KmdbPersonHit = { name: mapping.personName, kmdbId, role, creditCount: movies.length, latestYear };

    const kmdbIdIdx = result.findIndex((p) => p.kmdbId === kmdbId && p.role === role);
    if (kmdbIdIdx !== -1) {
      result = result.map((p, i) => (i === kmdbIdIdx ? corrected : p));
    } else if (nameIdx !== -1) {
      result = result.map((p, i) => (i === nameIdx ? corrected : p));
    } else {
      result = [corrected, ...result];
    }
  }
  return result;
}

// ── LLM 오타 교정 ─────────────────────────────────────────────────────────────
type LlmCorrection = {
  isValid: boolean;
  isCorrected: boolean;
  originalQuery: string;
  correctedQuery: string;
  didYouMean: string | null;
  searchKeywords: string[];
};

async function correctQueryWithLlm(query: string): Promise<LlmCorrection | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = `당신은 한국어/영어 영화 및 영화인(배우, 감독) 이름 표준화 및 오타 교정 전문 AI 엔진입니다.
사용자가 입력한 검색어(query)를 분석하여, 실제 존재하는 올바른 인물명이나 영화 제목으로 교정하고 대체 검색 키워드를 반환하세요.

[Rules]
1. 오타, 발음 변형, 맞춤법 오류, 영문-한글 혼용을 분석하세요. (예: "젠데이야" -> "젠데이아", "티모시샬라메" -> "티모시 샬라메", "돈룩백인앵거" -> "돈 룩 백 인 앵거")
2. 사용자의 입력이 오타/변형 표기로 판단되면 isCorrected: true로 설정하고 올바른 표준 명칭을 correctedQuery에 넣으세요.
3. 한국어 표기뿐만 아니라 영문 공식 명칭(English Title/Name)도 searchKeywords 배열에 포함하세요.
4. 검색어가 이미 완벽히 올바르다면 isCorrected: false, correctedQuery는 원본 그대로 유지하세요.
5. 오답 처리나 모호한 입력(예: 단순 외마디 초성, 의미 없는 문자열)일 경우 isValid: false로 응답하세요.
6. 오직 JSON 형식으로만 응답하며 다른 설명은 절대 추가하지 마세요.

[Output JSON Schema]
{
  "isValid": boolean,
  "isCorrected": boolean,
  "originalQuery": string,
  "correctedQuery": string,
  "didYouMean": string | null,
  "searchKeywords": string[]
}

[Example 1]
Input: "젠데이야"
Output: {"isValid":true,"isCorrected":true,"originalQuery":"젠데이야","correctedQuery":"젠데이아","didYouMean":"젠데이아","searchKeywords":["젠데이아","Zendaya"]}

[Example 2]
Input: "봉준호"
Output: {"isValid":true,"isCorrected":false,"originalQuery":"봉준호","correctedQuery":"봉준호","didYouMean":null,"searchKeywords":["봉준호","Bong Joon-ho"]}`;

  const llmAbort = new AbortController();
  const llmTimeout = setTimeout(() => llmAbort.abort(), 1200);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: llmAbort.signal,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: "user", content: `"${query}"` }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { content?: { text: string }[] };
    const text = data.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as LlmCorrection;
  } catch {
    return null;
  } finally {
    clearTimeout(llmTimeout);
  }
}

// ── 외부 API 결과 → CachedPerson 비동기 저장 ─────────────────────────────────
// KMDb/TMDB 검색 결과를 DB에 저장해두면 다음 동일 검색은 외부 API 없이 DB-fast path로 처리된다.
// await하지 않아 응답을 블로킹하지 않는다.
async function asyncSavePeopleToDb(
  kmdbPeople: KmdbPersonHit[],
  tmdbPeople: Array<{ tmdbId: string; name: string }>
): Promise<void> {
  const upserts: Promise<unknown>[] = [];

  // KMDb 인물: kmdbId가 있는 경우만 (이미 CachedPerson에 있을 가능성 높음)
  for (const p of kmdbPeople.slice(0, 5)) {
    if (!p.kmdbId) continue;
    upserts.push(
      upsertLimiter.run(() =>
        db.cachedPerson.upsert({
          where: { kmdbId: p.kmdbId },
          create: { kmdbId: p.kmdbId, name: p.name, role: p.role, filmography: [] },
          update: { name: p.name },
        })
      ).catch(() => {})
    );
  }

  // TMDB-only 외국 인물: synthetic id "tmdb-{tmdbId}" 로 저장
  for (const p of tmdbPeople.slice(0, 3)) {
    const syntheticId = `tmdb-${p.tmdbId}`;
    upserts.push(
      upsertLimiter.run(() =>
        db.cachedPerson.upsert({
          where: { kmdbId: syntheticId },
          create: { kmdbId: syntheticId, name: p.name, role: "배우", filmography: [], tmdbId: p.tmdbId },
          update: { name: p.name, tmdbId: p.tmdbId },
        })
      ).catch(() => {})
    );
  }

  await Promise.allSettled(upserts);
}

// ── 결과 조립 헬퍼 ────────────────────────────────────────────────────────────
function mergeMovieHits(apiHits: MovieHit[], dbHits: MovieHit[]): MovieHit[] {
  const seen = new Set(apiHits.map((h) => h.movieCd));
  const extras = dbHits.filter((h) => !seen.has(h.movieCd));
  return [...apiHits, ...extras].slice(0, 10);
}

// ── 외부 API 풀 검색 (DB miss 시에만 호출) ───────────────────────────────────
async function runExternalSearch(query: string) {
  const [movieHits, rawPeople, multiHits, cachedPeople, tmdbPersonHits] = await Promise.all([
    searchMoviesSince1960(query),
    searchKmdbPeople(query, 8),
    searchTmdbMulti(query),
    searchCachedPeople(query),    // 외부 검색과 병행해 CachedPerson도 같이 조회
    searchTmdbPerson(query),
  ]);

  // Strategy C: 공백·특수문자를 제거한 정규화 쿼리로 외부 영화 검색 재시도
  // (원본에 공백이 있고 결과가 0개일 때만)
  let finalMovieHits = movieHits;
  const stripped = normalizeForSearch(query);
  if (movieHits.length === 0 && stripped !== query.toLowerCase() && stripped.length >= 2) {
    finalMovieHits = await searchMoviesSince1960(stripped);
  }

  return { movieHits: finalMovieHits, rawPeople, multiHits, cachedPeople, tmdbPersonHits };
}

// ── DB 퍼지 검색 (자모 분리 + 레벤슈타인 유사도) ─────────────────────────────
// 쿼리 앞 2글자를 단서로 후보를 좁힌 뒤, 자모 분리 유사도로 최종 필터한다.
// TMDB/KOBIS/KMDb 에서도 결과가 없을 때 LLM 교정 전에 실행하는 빠른 로컬 대안.
async function fuzzySearchDb(query: string): Promise<{ movies: MovieHit[]; people: Array<KmdbPersonHit & { tmdbId?: string }> }> {
  const tokens = tokenizeQuery(query);
  // 슬라이딩 윈도우(2글자) + 각 토큰 앞 2글자를 OR 조건으로 구성.
  // 앞 2글자만 쓰면 첫 글자 오타("전데이아" → "젠데이아") 시 후보군 추출 실패.
  // 중간 위치의 2글자 조각도 함께 포함해 첫 글자 오타도 후보군에 잡힌다.
  const stripped = query.replace(/\s+/g, "");
  const windows = new Set<string>();
  for (let i = 0; i + 1 < stripped.length; i++) {
    windows.add(stripped.slice(i, i + 2));
  }
  for (const t of tokens) {
    const lead = t.slice(0, 2);
    if (lead.length >= 2) windows.add(lead);
  }
  const leadingConditions = [...windows];

  if (leadingConditions.length === 0) return { movies: [], people: [] };

  const [movieRows, personRows] = await Promise.all([
    db.cachedMovie.findMany({
      where: {
        OR: leadingConditions.map((s) => ({ title: { contains: s, mode: "insensitive" as const } })),
      },
      select: { movieCd: true, title: true, releaseDate: true, posterUrl: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    db.cachedPerson.findMany({
      where: {
        OR: [
          ...leadingConditions.map((s) => ({ name: { contains: s, mode: "insensitive" as const } })),
          ...leadingConditions.map((s) => ({ nameEn: { contains: s, mode: "insensitive" as const } })),
        ],
      },
      select: { kmdbId: true, name: true, role: true, tmdbId: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  const scoredMovies = movieRows
    .filter((r) => r.movieCd && !r.movieCd.startsWith("wikidata-"))
    .map((r) => ({ ...r, score: koreanSimilarity(query, r.title) }))
    .filter((r) => r.score >= FUZZY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => ({
      movieCd: r.movieCd,
      title: r.title,
      releaseDate: r.releaseDate,
      genre: null,
      posterUrl: r.posterUrl,
    }));

  const scoredPeople = personRows
    .map((r) => ({ ...r, score: koreanSimilarity(query, r.name) }))
    .filter((r) => r.score >= FUZZY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((r) => ({
      kmdbId: r.kmdbId,
      name: r.name,
      role: r.role as "감독" | "배우",
      creditCount: 0,
      latestYear: null as string | null,
      tmdbId: r.tmdbId ?? undefined,
    }));

  return { movies: scoredMovies, people: scoredPeople };
}

// ── GET /api/search-movies?q=... ─────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ movies: [], series: [], people: [], correctedQuery: null });
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const localeMatch = cookieHeader.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  const locale = localeMatch?.[1] === "en" ? "en" : "ko";

  // ── 1단계: 서버 인메모리 캐시 확인 ────────────────────────────────────────
  const cacheKey = `${locale}:${query.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  // ── 2단계: DB 우선 조회 (빠른 경로 — 외부 API 호출 없이 20~40ms 응답) ──────
  const [dbMovies, dbPeople] = await Promise.all([
    searchCachedMovies(query),
    searchCachedPeople(query),
  ]);

  // DB에 충분한 결과가 있으면 외부 API 호출 없이 즉시 반환.
  // 기준: 영화 3편 이상, 또는 영화 1편 이상 + 인물 1명 이상.
  const hasEnoughDbResults = dbMovies.length >= 3 || (dbMovies.length >= 1 && dbPeople.length >= 1);
  if (hasEnoughDbResults) {
    const result = {
      movies: dbMovies,
      series: [],
      people: dbPeople.map((p) => ({ ...p, representativeWorks: [] })),
      correctedQuery: null,
    };
    setCache(cacheKey, result);
    return NextResponse.json(result);
  }

  // 클라이언트가 이미 요청을 취소했으면 외부 API 호출 없이 즉시 중단한다.
  if (request.signal.aborted) return new Response(null, { status: 499 });

  // ── 3단계: DB miss → 외부 API 병렬 호출 ──────────────────────────────────
  const { movieHits, rawPeople, multiHits, cachedPeople: freshCachedPeople, tmdbPersonHits } =
    await runExternalSearch(query);

  const kmdbPeople = await withIdentityMappingOverride(rawPeople, query);

  const mergedPeople: Array<KmdbPersonHit & { tmdbId?: string }> = [...kmdbPeople];
  const existingNames = new Set(kmdbPeople.map((p) => p.name.toLowerCase()));

  for (const cp of freshCachedPeople) {
    if (!existingNames.has(cp.name.toLowerCase())) {
      mergedPeople.push(cp);
      existingNames.add(cp.name.toLowerCase());
    }
  }
  for (const tp of tmdbPersonHits.slice(0, 3)) {
    if (!existingNames.has(tp.name.toLowerCase())) {
      mergedPeople.push({ kmdbId: "", name: tp.name, role: "배우", creditCount: 0, latestYear: null, tmdbId: tp.tmdbId });
      existingNames.add(tp.name.toLowerCase());
    }
  }

  const seriesHits = multiHits
    .filter((h) => h.mediaType === "tv")
    .map((h) => ({ tmdbId: h.tmdbId, name: h.title, firstAirDate: h.year ? `${h.year}-01-01` : null, posterUrl: h.posterUrl }));

  if (movieHits.length > 0 || mergedPeople.length > 0 || seriesHits.length > 0 || dbMovies.length > 0) {
    const [movies, peopleWithWorks] = await Promise.all([
      withPosters(movieHits, locale),
      withRepresentativeWorks(kmdbPeople),
    ]);

    const kmdbNames = new Set(kmdbPeople.map((p) => p.name.toLowerCase()));
    const extraPeople = mergedPeople.filter((p) => !kmdbNames.has(p.name.toLowerCase()));
    const people = [...peopleWithWorks, ...extraPeople.map((p) => ({ ...p, representativeWorks: [] }))];

    // 외부 API 결과를 DB에 비동기 저장 (응답을 블로킹하지 않음)
    asyncSavePeopleToDb(kmdbPeople, tmdbPersonHits).catch(console.error);

    const mergedMovies = mergeMovieHits(movies, dbMovies);
    const result = { movies: mergedMovies, series: seriesHits, people, correctedQuery: null };
    setCache(cacheKey, result);
    return NextResponse.json(result);
  }

  if (request.signal.aborted) return new Response(null, { status: 499 });

  // ── 4단계: DB 퍼지 검색 (자모/레벤슈타인) ────────────────────────────────
  // 외부 API 에서도 결과가 없을 때 LLM 호출 전에 빠른 로컬 유사도 매칭을 시도.
  const fuzzyDb = await fuzzySearchDb(query);
  if (fuzzyDb.movies.length > 0 || fuzzyDb.people.length > 0) {
    const result = {
      movies: fuzzyDb.movies,
      series: [],
      people: fuzzyDb.people.map((p) => ({ ...p, representativeWorks: [] })),
      correctedQuery: null,
    };
    setCache(cacheKey, result);
    return NextResponse.json(result);
  }

  if (request.signal.aborted) return new Response(null, { status: 499 });

  // LLM 호출 스킵: 2글자 미만이거나 숫자로만 이루어진 쿼리는 교정 불가 → 비용 낭비 방지
  if (query.length < 2 || /^\d+$/.test(query)) {
    const empty = { movies: [], series: [], people: [], correctedQuery: null };
    setCache(cacheKey, empty);
    return NextResponse.json(empty);
  }

  // ── 5단계: 결과 없음 → LLM 오타 교정 시도 ───────────────────────────────
  const llmCorrection = await correctQueryWithLlm(query);

  let keywordsToTry: string[] = [];
  let didYouMean: string | null = null;

  if (llmCorrection?.isValid && llmCorrection.searchKeywords.length > 0) {
    keywordsToTry = llmCorrection.searchKeywords.filter(
      (k) => k.toLowerCase() !== query.toLowerCase()
    );
    didYouMean = llmCorrection.isCorrected ? (llmCorrection.didYouMean ?? llmCorrection.correctedQuery) : null;
  }

  if (keywordsToTry.length === 0) {
    const suggested = await suggestSimilarTitle(query);
    if (suggested) {
      keywordsToTry = [suggested];
      didYouMean = suggested;
    }
  }

  if (keywordsToTry.length === 0) {
    const empty = { movies: [], series: [], people: [], correctedQuery: null };
    setCache(cacheKey, empty);
    return NextResponse.json(empty);
  }

  for (const keyword of keywordsToTry) {
    // 교정 키워드도 DB-first로 먼저 조회
    const [dbCorrected, dbCorrectedPeople] = await Promise.all([
      searchCachedMovies(keyword),
      searchCachedPeople(keyword),
    ]);

    const hasEnoughCorrectedDb = dbCorrected.length >= 3 || (dbCorrected.length >= 1 && dbCorrectedPeople.length >= 1);
    if (hasEnoughCorrectedDb) {
      const result = {
        movies: dbCorrected,
        series: [],
        people: dbCorrectedPeople.map((p) => ({ ...p, representativeWorks: [] })),
        correctedQuery: didYouMean ?? keyword,
      };
      setCache(cacheKey, result);
      return NextResponse.json(result);
    }

    const {
      movieHits: correctedMovieHits,
      rawPeople: rawCorrectedPeople,
      multiHits: correctedMultiHits,
      cachedPeople: correctedCachedPeople,
      tmdbPersonHits: correctedTmdbPersonHits,
    } = await runExternalSearch(keyword);

    const correctedKmdbPeople = await withIdentityMappingOverride(rawCorrectedPeople, keyword);

    const correctedMergedPeople: Array<KmdbPersonHit & { tmdbId?: string }> = [...correctedKmdbPeople];
    const correctedExistingNames = new Set(correctedKmdbPeople.map((p) => p.name.toLowerCase()));
    for (const cp of correctedCachedPeople) {
      if (!correctedExistingNames.has(cp.name.toLowerCase())) {
        correctedMergedPeople.push(cp);
        correctedExistingNames.add(cp.name.toLowerCase());
      }
    }
    for (const tp of correctedTmdbPersonHits.slice(0, 3)) {
      if (!correctedExistingNames.has(tp.name.toLowerCase())) {
        correctedMergedPeople.push({ kmdbId: "", name: tp.name, role: "배우", creditCount: 0, latestYear: null, tmdbId: tp.tmdbId });
        correctedExistingNames.add(tp.name.toLowerCase());
      }
    }

    const correctedSeriesHits = correctedMultiHits
      .filter((h) => h.mediaType === "tv")
      .map((h) => ({ tmdbId: h.tmdbId, name: h.title, firstAirDate: h.year ? `${h.year}-01-01` : null, posterUrl: h.posterUrl }));

    const found = correctedMovieHits.length > 0 || correctedMergedPeople.length > 0 || correctedSeriesHits.length > 0 || dbCorrected.length > 0;
    if (!found) continue;

    const [correctedMovies, correctedPeopleWithWorks] = await Promise.all([
      withPosters(correctedMovieHits, locale),
      withRepresentativeWorks(correctedKmdbPeople),
    ]);
    const correctedKmdbNames = new Set(correctedKmdbPeople.map((p) => p.name.toLowerCase()));
    const correctedExtraPeople = correctedMergedPeople.filter((p) => !correctedKmdbNames.has(p.name.toLowerCase()));
    const correctedPeople = [...correctedPeopleWithWorks, ...correctedExtraPeople.map((p) => ({ ...p, representativeWorks: [] }))];

    asyncSavePeopleToDb(correctedKmdbPeople, correctedTmdbPersonHits).catch(console.error);

    const correctedResult = {
      movies: mergeMovieHits(correctedMovies, dbCorrected),
      series: correctedSeriesHits,
      people: correctedPeople,
      correctedQuery: didYouMean ?? keyword,
    };
    setCache(cacheKey, correctedResult);
    return NextResponse.json(correctedResult);
  }

  const empty = { movies: [], series: [], people: [], correctedQuery: null };
  setCache(cacheKey, empty);
  return NextResponse.json(empty);
}
