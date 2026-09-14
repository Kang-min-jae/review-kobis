// "추천 시리즈" 홈 행과 TV 탭을 위한 데이터 레이어.
// KOBIS/KMDb가 아닌 TMDB TV 엔드포인트를 사용하고, CachedSeries에 캐시한다.

import { db } from "./db";
import { getTmdbSeriesDetails, getTmdbPopularSeries } from "./tmdb";
import { splitGenres } from "./movie-rows";
import { getBulkMovieRatingAverages } from "./review-data";
import type { RowMovie } from "./movie-rows";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";
const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3일

// 편집자 추천 시리즈 TMDB ID 목록 — 국내외 명작 드라마·애니메이션
const CURATED_SERIES_IDS = [
  "93405",  // 오징어 게임 (Squid Game)
  "128064", // 사이버펑크: 엣지러너 (Cyberpunk: Edgerunners)
  "4613",   // 밴드 오브 브라더스 (Band of Brothers)
  "87108",  // 체르노빌 (Chernobyl)
  "1396",   // 브레이킹 배드 (Breaking Bad)
  "95396",  // 세브란스 (Severance)
  "63333",  // 석세션 (Succession)
  "71446",  // 종이의 집 (La Casa de Papel)
  "1399",   // 왕좌의 게임 (Game of Thrones)
  "60059",  // 베터 콜 사울 (Better Call Saul)
];

async function getOrFetchSeries(tmdbId: string): Promise<RowMovie | null> {
  let cached = null;
  let dbAvailable = true;

  try {
    cached = await db.cachedSeries.findUnique({ where: { tmdbId } });
  } catch {
    // P2021 (테이블 없음) 등 DB 오류 — DB 없이 TMDB 직접 호출로 폴백
    dbAvailable = false;
  }

  const isStale = !cached || Date.now() - cached.updatedAt.getTime() > CACHE_TTL_MS;

  if (cached && !isStale) {
    const all = splitGenres(cached.genreAlt);
    return {
      id: `tmdb-tv-${tmdbId}`,
      title: cached.name,
      posterUrl: cached.posterUrl,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: false,
      genre: all.length > 0 ? all.slice(0, 2).join(" · ") : null,
      allGenres: all,
    };
  }

  const details = await getTmdbSeriesDetails(tmdbId);
  if (!details) return null;

  if (dbAvailable) {
    try {
      await db.cachedSeries.upsert({
        where: { tmdbId },
        update: {
          name: details.name,
          originalName: details.originalName,
          posterUrl: details.posterUrl,
          overview: details.overview,
          firstAirDate: details.firstAirDate,
          genreAlt: details.genre,
          seasonCount: details.seasonCount,
        },
        create: {
          tmdbId,
          name: details.name,
          originalName: details.originalName,
          posterUrl: details.posterUrl,
          overview: details.overview,
          firstAirDate: details.firstAirDate,
          genreAlt: details.genre,
          seasonCount: details.seasonCount,
        },
      });
    } catch {
      // DB 쓰기 실패는 무시 — 이번 렌더에서 데이터는 반환 가능
    }
  }

  const all = splitGenres(details.genre);
  return {
    id: `tmdb-tv-${tmdbId}`,
    title: details.name,
    posterUrl: details.posterUrl,
    gradient: FALLBACK_GRADIENT,
    isNowShowing: false,
    genre: all.length > 0 ? all.slice(0, 2).join(" · ") : null,
    allGenres: all,
  };
}

export async function getCuratedSeriesRow(): Promise<RowMovie[]> {
  const results = await Promise.all(CURATED_SERIES_IDS.map(getOrFetchSeries));
  const rows = results.filter((r): r is RowMovie => r !== null && r.posterUrl !== null);
  const avgMap = await getBulkMovieRatingAverages(rows.map((r) => r.id));
  return rows.map((r) => {
    const avgs = avgMap.get(r.id);
    return { ...r, shortAvg: avgs?.shortAvg ?? null, longAvg: avgs?.longAvg ?? null };
  });
}

// 사용자 평균 평점(전체) 기준 Best 시리즈 행 — 데이터 부족 시 TMDB 인기 순으로 폴백.
export async function getPopularSeriesRow(): Promise<RowMovie[]> {
  let topRated: { movieCd: string; _avg: { score: number | null } }[] = [];
  try {
    topRated = await db.categoryRating.groupBy({
      by: ["movieCd"],
      where: { category: "전체" },
      _avg: { score: true },
      orderBy: { _avg: { score: "desc" } },
      take: 80,
    });
  } catch {
    // DB 오류 — 폴백으로 진행
  }

  const tvRated = topRated.filter((r) => r.movieCd.startsWith("tmdb-tv-"));

  if (tvRated.length >= 3) {
    const tmdbIds = tvRated.map((r) => r.movieCd.slice("tmdb-tv-".length));
    const movieCds = tvRated.map((r) => r.movieCd);
    const [cachedList, avgMap] = await Promise.all([
      db.cachedSeries.findMany({ where: { tmdbId: { in: tmdbIds } } }).catch(() => []),
      getBulkMovieRatingAverages(movieCds),
    ]);
    const byId = new Map(cachedList.map((c) => [c.tmdbId, c]));

    const results: RowMovie[] = [];
    for (const r of tvRated) {
      const tmdbId = r.movieCd.slice("tmdb-tv-".length);
      const cached = byId.get(tmdbId);
      if (!cached?.posterUrl) continue;
      const all = splitGenres(cached.genreAlt);
      const avgs = avgMap.get(r.movieCd);
      results.push({
        id: r.movieCd,
        title: cached.name,
        posterUrl: cached.posterUrl,
        gradient: FALLBACK_GRADIENT,
        isNowShowing: false,
        genre: all.length > 0 ? all.slice(0, 2).join(" · ") : null,
        allGenres: all,
        shortAvg: avgs?.shortAvg ?? null,
        longAvg: avgs?.longAvg ?? null,
      });
    }
    if (results.length >= 3) return results;
  }

  // 폴백: TMDB 인기 목록
  const list = await getTmdbPopularSeries();
  return list
    .filter((s) => s.posterUrl !== null)
    .map((s) => ({
      id: `tmdb-tv-${s.tmdbId}`,
      title: s.name,
      posterUrl: s.posterUrl,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: false,
      genre: null,
      allGenres: [],
    }));
}

// 사용자 평점 등록 수 기준 TOP 10 시리즈 — TV 탭 캐러셀용.
// 평점 데이터가 부족(3개 미만)하면 TMDB 인기 목록 → 큐레이션 순으로 폴백.
export async function getTop10PopularSeriesRow(): Promise<RowMovie[]> {
  // 1. DB에서 평점 수 많은 순으로 tmdb-tv-* movieCd 조회
  let topRated: { movieCd: string; _count: { movieCd: number } }[] = [];
  try {
    topRated = await db.categoryRating.groupBy({
      by: ["movieCd"],
      _count: { movieCd: true },
      orderBy: { _count: { movieCd: "desc" } },
      take: 60,
    });
  } catch {
    // P2021(테이블 없음) 등 DB 오류 — 폴백으로 진행
  }

  const tvTopRated = topRated.filter((r) => r.movieCd.startsWith("tmdb-tv-"));

  if (tvTopRated.length >= 3) {
    const tmdbIds = tvTopRated.map((r) => r.movieCd.slice("tmdb-tv-".length));
    const movieCds = tvTopRated.map((r) => r.movieCd);
    const [cachedList, avgMap] = await Promise.all([
      db.cachedSeries.findMany({ where: { tmdbId: { in: tmdbIds } } }).catch(() => []),
      getBulkMovieRatingAverages(movieCds),
    ]);
    const byId = new Map(cachedList.map((c) => [c.tmdbId, c]));

    const results: RowMovie[] = [];
    for (const r of tvTopRated) {
      if (results.length >= 10) break;
      const tmdbId = r.movieCd.slice("tmdb-tv-".length);
      const cached = byId.get(tmdbId);
      if (!cached?.posterUrl) continue;
      const avgs = avgMap.get(r.movieCd);
      results.push({
        id: r.movieCd,
        title: cached.name,
        posterUrl: cached.posterUrl,
        gradient: FALLBACK_GRADIENT,
        isNowShowing: false,
        badge: `${results.length + 1}위`,
        genre: null,
        allGenres: [],
        shortAvg: avgs?.shortAvg ?? null,
        longAvg: avgs?.longAvg ?? null,
      });
    }
    if (results.length >= 3) return results;
  }

  // 폴백 1: TMDB 인기 목록 (top10)
  const popular = await getTmdbPopularSeries();
  const filtered = popular.filter((s) => s.posterUrl !== null).slice(0, 10);
  if (filtered.length > 0) {
    return filtered.map((s, i) => ({
      id: `tmdb-tv-${s.tmdbId}`,
      title: s.name,
      posterUrl: s.posterUrl,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: false,
      badge: `${i + 1}위`,
      genre: null,
      allGenres: [],
    }));
  }

  // 폴백 2: 큐레이션 목록
  const curatedResults = await Promise.all(CURATED_SERIES_IDS.map(getOrFetchSeries));
  return curatedResults
    .filter((r): r is RowMovie => r !== null && r.posterUrl !== null)
    .slice(0, 10)
    .map((r, i) => ({ ...r, badge: `${i + 1}위` }));
}
