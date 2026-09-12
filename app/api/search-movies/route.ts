import { NextResponse } from "next/server";
import { searchMoviesSince1960, searchKoficPeopleList, type KobisSearchHit } from "../../_lib/kobis";
import { searchKmdbPeople, searchKmdbFilmography, suggestSimilarTitle, type KmdbPersonHit } from "../../_lib/kmdb";
import { getMovieMeta, getMovieMetas } from "../../_lib/movie-rate-info";
import { searchTmdbMulti } from "../../_lib/tmdb";
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
  const [dbHits, movieHits, rawPeople, multiHits] = await Promise.all([
    searchCachedMovies(query),
    searchMoviesSince1960(query),
    searchKmdbPeople(query, 8),
    searchTmdbMulti(query),
  ]);
  const people = await withIdentityMappingOverride(rawPeople, query);

  const seriesHits = multiHits
    .filter((h) => h.mediaType === "tv")
    .map((h) => ({ tmdbId: h.tmdbId, name: h.title, firstAirDate: h.year ? `${h.year}-01-01` : null, posterUrl: h.posterUrl }));

  if (movieHits.length > 0 || people.length > 0 || seriesHits.length > 0 || dbHits.length > 0) {
    // 외부 API 결과에 포스터 배치 조회 (1번의 findMany) + 대표작 조회를 병렬 실행
    const [movies, peopleWithWorks] = await Promise.all([
      withPosters(movieHits),
      withRepresentativeWorks(people),
    ]);

    const mergedMovies = mergeMovieHits(movies, dbHits);
    const result = { movies: mergedMovies, series: seriesHits, people: peopleWithWorks, correctedQuery: null };
    setCache(cacheKey, result);
    return NextResponse.json(result);
  }

  // 결과가 아예 없으면 오타 교정 시도
  const suggested = await suggestSimilarTitle(query);
  if (!suggested) {
    const empty = { movies: [], series: [], people: [], correctedQuery: null };
    setCache(cacheKey, empty);
    return NextResponse.json(empty);
  }

  const [correctedMovieHits, rawCorrectedPeople, correctedMultiHits] = await Promise.all([
    searchMoviesSince1960(suggested),
    searchKmdbPeople(suggested, 8),
    searchTmdbMulti(suggested),
  ]);
  const correctedPeople = await withIdentityMappingOverride(rawCorrectedPeople, suggested);
  const correctedSeriesHits = correctedMultiHits
    .filter((h) => h.mediaType === "tv")
    .map((h) => ({ tmdbId: h.tmdbId, name: h.title, firstAirDate: h.year ? `${h.year}-01-01` : null, posterUrl: h.posterUrl }));
  const found = correctedMovieHits.length > 0 || correctedPeople.length > 0 || correctedSeriesHits.length > 0;
  const [correctedMovies, correctedPeopleWithWorks] = await Promise.all([
    withPosters(correctedMovieHits),
    withRepresentativeWorks(correctedPeople),
  ]);

  const correctedResult = {
    movies: correctedMovies,
    series: correctedSeriesHits,
    people: correctedPeopleWithWorks,
    correctedQuery: found ? suggested : null,
  };
  setCache(cacheKey, correctedResult);
  return NextResponse.json(correctedResult);
}
