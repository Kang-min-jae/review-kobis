import { NextResponse } from "next/server";
import { searchMoviesSince1960, searchKoficPeopleList, type KobisSearchHit } from "../../_lib/kobis";
import { searchKmdbPeople, searchKmdbFilmography, suggestSimilarTitle, type KmdbPersonHit } from "../../_lib/kmdb";
import { getMovieMeta, getMovieMetas } from "../../_lib/movie-rate-info";
import { searchTmdbMulti, searchTmdbPerson } from "../../_lib/tmdb";
import { db } from "../../_lib/db";

// ── 결과 타입 ─────────────────────────────────────────────────────────────────

type MovieHit = KobisSearchHit & { posterUrl: string | null };

// ── 인-메모리 검색 결과 캐시 (2분 TTL) ───────────────────────────────────────
// 서버리스 환경에서도 요청 간 모듈 상태가 유지되는 동안은 살아있어, 같은 쿼리를
// 짧은 간격으로 반복해서 보낼 때(디바운스 내 중복 요청, 뒤로가기 후 재검색 등)
// 외부 API를 다시 호출하지 않고 즉시 응답한다.

type CacheEntry = {
  data: object;
  expiresAt: number;
};
const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2분

function getCached(key: string): object | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    searchCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: object) {
  // 캐시가 너무 커지지 않도록 오래된 항목을 지운다
  if (searchCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of searchCache) {
      if (now > v.expiresAt) searchCache.delete(k);
    }
  }
  searchCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── 포스터 붙이기: 배치 조회 ──────────────────────────────────────────────────
// 기존에는 hits.map(getMovieMeta) → N개의 개별 DB findUnique 요청이었지만,
// getMovieMetas를 쓰면 한 번의 findMany로 캐시된 항목을 모두 가져온다.
// 캐시 미스(처음 보는 영화)인 경우에만 각 항목별로 KOBIS+KMDb를 호출한다.
async function withPosters(hits: KobisSearchHit[]): Promise<MovieHit[]> {
  if (hits.length === 0) return [];
  const metas = await getMovieMetas(hits.map((h) => h.movieCd));
  return hits.map((hit) => ({ ...hit, posterUrl: metas.get(hit.movieCd)?.posterUrl ?? null }));
}

// ── CachedPerson 인물 검색 (한글명 + 영문명) ──────────────────────────────────
// name(한글명)과 nameEn(영문명)을 동시에 검색한다. 외국 인물이 영문 이름으로
// CachedPerson에 캐시돼 있을 때 한글 쿼리로는 못 찾는 한계를 보완한다.
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

// ── DB 제목 검색 (빠른 경로) ──────────────────────────────────────────────────
// CachedMovie 테이블을 로컬에서 먼저 검색한다. 이미 한 번이라도 조회된 영화(홈
// 화면·평점 페이지 등에서 캐시된)는 외부 API 왕복 없이 바로 반환한다.
async function searchCachedMovies(query: string): Promise<MovieHit[]> {
  const rows = await db.cachedMovie.findMany({
    where: { title: { contains: query, mode: "insensitive" } },
    select: { movieCd: true, title: true, releaseDate: true, posterUrl: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  return rows
    .filter((r) => r.movieCd && !r.movieCd.startsWith("wikidata-"))
    .map((r) => ({
      movieCd: r.movieCd,
      title: r.title,
      releaseDate: r.releaseDate,
      genre: null,
      posterUrl: r.posterUrl,
    }));
}

// ── KOFIC 대표작 붙이기 ───────────────────────────────────────────────────────
async function withRepresentativeWorks(
  people: KmdbPersonHit[]
): Promise<(KmdbPersonHit & { representativeWorks: string[] })[]> {
  return Promise.all(
    people.map(async (person) => {
      const koficHits = await searchKoficPeopleList(person.name);
      const sameName = koficHits.filter((h) => h.name === person.name);
      if (sameName.length !== 1) return { ...person, representativeWorks: [] };
      return { ...person, representativeWorks: sameName[0].filmoNames.slice(0, 3) };
    })
  );
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
// 1차 검색 결과가 0건일 때만 호출한다(비용·지연 최소화).
// Claude Haiku로 교정 단어 + 영문 키워드 배열을 추출한다.
// API 키 미설정 또는 오류 시 null 반환 → 기존 KMDb 폴백으로 이어짐.

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

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
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
  }
}

// ── 결과 조립 헬퍼 ────────────────────────────────────────────────────────────
// 외부 API 결과 + DB 캐시 결과를 합치되, movieCd 기준으로 중복 제거한다.
// 외부 API 결과가 더 신선하므로 우선순위가 높다.
function mergeMovieHits(apiHits: MovieHit[], dbHits: MovieHit[]): MovieHit[] {
  const seen = new Set(apiHits.map((h) => h.movieCd));
  const extras = dbHits.filter((h) => !seen.has(h.movieCd));
  return [...apiHits, ...extras].slice(0, 10);
}

// ── GET /api/search-movies?q=... ─────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ movies: [], series: [], people: [], correctedQuery: null });
  }

  // 캐시 히트: 동일 쿼리에 대해 2분 이내 결과가 있으면 즉시 반환
  const cacheKey = query.toLowerCase();
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  // DB 캐시 제목 검색 + 외부 API 검색을 동시에 시작한다.
  // DB 검색은 보통 수ms, 외부 API는 수백ms~수초 — 둘 다 기다렸다가 합쳐서 반환한다.
  const [dbHits, movieHits, rawPeople, multiHits, cachedPeople, tmdbPersonHits] = await Promise.all([
    searchCachedMovies(query),
    searchMoviesSince1960(query),
    searchKmdbPeople(query, 8),
    searchTmdbMulti(query),
    searchCachedPeople(query),
    searchTmdbPerson(query),
  ]);
  const kmdbPeople = await withIdentityMappingOverride(rawPeople, query);

  // KMDb 인물 결과를 기준으로, CachedPerson / TMDB 인물을 이름 기반으로 병합한다.
  // 이미 KMDb에 있는 인물은 건너뛰고, 외국 인물처럼 KMDb에 없는 경우에만 추가한다.
  const mergedPeople: Array<KmdbPersonHit & { tmdbId?: string }> = [...kmdbPeople];
  const existingNames = new Set(kmdbPeople.map((p) => p.name.toLowerCase()));

  // CachedPerson(이전에 조회된 외국 인물 포함) 보완
  for (const cp of cachedPeople) {
    if (!existingNames.has(cp.name.toLowerCase())) {
      mergedPeople.push(cp);
      existingNames.add(cp.name.toLowerCase());
    }
  }

  // TMDB 인물 검색 결과 보완 — kmdbId 없이 tmdbId만 가지는 외국 인물
  for (const tp of tmdbPersonHits.slice(0, 3)) {
    if (!existingNames.has(tp.name.toLowerCase())) {
      mergedPeople.push({ kmdbId: "", name: tp.name, role: "배우", creditCount: 0, latestYear: null, tmdbId: tp.tmdbId });
      existingNames.add(tp.name.toLowerCase());
    }
  }

  const seriesHits = multiHits
    .filter((h) => h.mediaType === "tv")
    .map((h) => ({ tmdbId: h.tmdbId, name: h.title, firstAirDate: h.year ? `${h.year}-01-01` : null, posterUrl: h.posterUrl }));

  if (movieHits.length > 0 || mergedPeople.length > 0 || seriesHits.length > 0 || dbHits.length > 0) {
    // 외부 API 결과에 포스터 배치 조회 (1번의 findMany) + 대표작 조회를 병렬 실행
    const [movies, peopleWithWorks] = await Promise.all([
      withPosters(movieHits),
      withRepresentativeWorks(kmdbPeople),
    ]);

    // KMDb 대표작이 붙은 사람과 TMDB/CachedPerson에서 보완된 사람을 다시 합친다
    const kmdbNames = new Set(kmdbPeople.map((p) => p.name.toLowerCase()));
    const extraPeople = mergedPeople.filter((p) => !kmdbNames.has(p.name.toLowerCase()));
    const people = [...peopleWithWorks, ...extraPeople.map((p) => ({ ...p, representativeWorks: [] }))];

    const mergedMovies = mergeMovieHits(movies, dbHits);
    const result = { movies: mergedMovies, series: seriesHits, people, correctedQuery: null };
    setCache(cacheKey, result);
    return NextResponse.json(result);
  }

  // 결과가 아예 없으면 LLM 오타 교정 시도.
  // LLM이 반환한 searchKeywords(한글 교정어 + 영문명)를 순서대로 검색해
  // 처음 결과가 나오는 키워드로 최종 응답을 만든다.
  // LLM을 쓸 수 없는 환경(API 키 없음·오류)에서는 기존 KMDb 기반 교정으로 폴백한다.
  const llmCorrection = await correctQueryWithLlm(query);

  let keywordsToTry: string[] = [];
  let didYouMean: string | null = null;

  if (llmCorrection?.isValid && llmCorrection.searchKeywords.length > 0) {
    // 원본 쿼리와 동일한 키워드(대소문자 무시)는 이미 시도했으니 제외
    keywordsToTry = llmCorrection.searchKeywords.filter(
      (k) => k.toLowerCase() !== query.toLowerCase()
    );
    didYouMean = llmCorrection.isCorrected ? (llmCorrection.didYouMean ?? llmCorrection.correctedQuery) : null;
  }

  // LLM 키워드가 없으면 KMDb 유사 제목 교정으로 폴백
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

  // 키워드를 순서대로 시도 — 결과가 나오는 첫 번째 키워드에서 멈춘다
  for (const keyword of keywordsToTry) {
    const [dbCorrectedHits, correctedMovieHits, rawCorrectedPeople, correctedMultiHits, correctedCachedPeople, correctedTmdbPersonHits] = await Promise.all([
      searchCachedMovies(keyword),
      searchMoviesSince1960(keyword),
      searchKmdbPeople(keyword, 8),
      searchTmdbMulti(keyword),
      searchCachedPeople(keyword),
      searchTmdbPerson(keyword),
    ]);
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

    const found = correctedMovieHits.length > 0 || correctedMergedPeople.length > 0 || correctedSeriesHits.length > 0 || dbCorrectedHits.length > 0;
    if (!found) continue;

    const [correctedMovies, correctedPeopleWithWorks] = await Promise.all([
      withPosters(correctedMovieHits),
      withRepresentativeWorks(correctedKmdbPeople),
    ]);
    const correctedKmdbNames = new Set(correctedKmdbPeople.map((p) => p.name.toLowerCase()));
    const correctedExtraPeople = correctedMergedPeople.filter((p) => !correctedKmdbNames.has(p.name.toLowerCase()));
    const correctedPeople = [...correctedPeopleWithWorks, ...correctedExtraPeople.map((p) => ({ ...p, representativeWorks: [] }))];

    const correctedResult = {
      movies: mergeMovieHits(correctedMovies, dbCorrectedHits),
      series: correctedSeriesHits,
      people: correctedPeople,
      // 교정 표시어: LLM이 제안한 한글 단어 우선, 없으면 실제로 히트한 키워드
      correctedQuery: didYouMean ?? keyword,
    };
    setCache(cacheKey, correctedResult);
    return NextResponse.json(correctedResult);
  }

  // 모든 키워드로도 결과 없음
  const empty = { movies: [], series: [], people: [], correctedQuery: null };
  setCache(cacheKey, empty);
  return NextResponse.json(empty);
}
