import { db } from "./db";
import { getMovieMeta } from "./movie-rate-info";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

export type MyRatedMovie = {
  id: string;
  title: string;
  posterUrl: string | null;
  gradient: string;
  rating: number; // 0~10
  ratedAt: string; // ISO
};

function movieIdFromCd(movieCd: string): string {
  if (movieCd.startsWith("tmdb-tv-") || movieCd.startsWith("wikidata-")) return movieCd;
  return `kobis-${movieCd}`;
}

export async function getMyRatedMovies(userId: string): Promise<MyRatedMovie[]> {
  const ratings = await db.categoryRating.findMany({
    where: { userId, category: "전체" },
    orderBy: { createdAt: "desc" },
  });
  if (ratings.length === 0) return [];

  // KOBIS 코드(숫자)만 movie-rate-info로 메타 조회; 시리즈/wikidata는 DB 캐시 직접 조회
  const kobisRatings = ratings.filter((r) => /^\d+$/.test(r.movieCd));
  const metas = await Promise.all(kobisRatings.map((r) => getMovieMeta(r.movieCd)));
  const kobishMetaMap = new Map(kobisRatings.map((r, i) => [r.movieCd, metas[i]]));

  const seriesIds = ratings
    .filter((r) => r.movieCd.startsWith("tmdb-tv-"))
    .map((r) => r.movieCd.slice("tmdb-tv-".length));
  const seriesCache = seriesIds.length > 0
    ? await db.cachedSeries.findMany({ where: { tmdbId: { in: seriesIds } } }).catch(() => [])
    : [];
  const seriesMap = new Map(seriesCache.map((s) => [`tmdb-tv-${s.tmdbId}`, s]));

  const wikidataIds = ratings
    .filter((r) => r.movieCd.startsWith("wikidata-"))
    .map((r) => r.movieCd);
  const wikidataCache = wikidataIds.length > 0
    ? await db.cachedMovie.findMany({ where: { movieCd: { in: wikidataIds } } }).catch(() => [])
    : [];
  const wikidataMap = new Map(wikidataCache.map((m) => [m.movieCd, m]));

  return ratings.map((r) => {
    let title = r.movieCd;
    let posterUrl: string | null = null;

    if (r.movieCd.startsWith("tmdb-tv-")) {
      const s = seriesMap.get(r.movieCd);
      title = s?.name ?? r.movieCd;
      posterUrl = s?.posterUrl ?? null;
    } else if (r.movieCd.startsWith("wikidata-")) {
      const m = wikidataMap.get(r.movieCd);
      title = m?.title ?? r.movieCd;
      posterUrl = m?.posterUrl ?? null;
    } else {
      const meta = kobishMetaMap.get(r.movieCd);
      title = meta?.movieTitle ?? r.movieCd;
      posterUrl = meta?.posterUrl ?? null;
    }

    return {
      id: movieIdFromCd(r.movieCd),
      title,
      posterUrl,
      gradient: FALLBACK_GRADIENT,
      rating: r.score,
      ratedAt: r.createdAt.toISOString(),
    };
  });
}
