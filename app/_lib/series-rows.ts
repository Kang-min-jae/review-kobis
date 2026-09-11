// "추천 시리즈" 홈 행과 TV 탭을 위한 데이터 레이어.
// KOBIS/KMDb가 아닌 TMDB TV 엔드포인트를 사용하고, CachedSeries에 캐시한다.

import { db } from "./db";
import { getTmdbSeriesDetails, getTmdbPopularSeries } from "./tmdb";
import { splitGenres } from "./movie-rows";
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
  const cached = await db.cachedSeries.findUnique({ where: { tmdbId } });
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
  return results.filter((r): r is RowMovie => r !== null && r.posterUrl !== null);
}

export async function getPopularSeriesRow(): Promise<RowMovie[]> {
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

// 순위 배지(1위~10위)를 붙인 인기 시리즈 TOP 10 — TV 탭 캐러셀용.
// TMDB /tv/popular 실패(API 키 없음·네트워크 오류) 시 큐레이션 목록으로 폴백.
export async function getTop10PopularSeriesRow(): Promise<RowMovie[]> {
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

  // 폴백: 큐레이션 목록을 DB 캐시에서 가져와 순위 배지 부여
  const curatedResults = await Promise.all(CURATED_SERIES_IDS.map(getOrFetchSeries));
  return curatedResults
    .filter((r): r is RowMovie => r !== null && r.posterUrl !== null)
    .slice(0, 10)
    .map((r, i) => ({ ...r, badge: `${i + 1}위` }));
}
