import { db } from "./db";
import { getMovieMeta } from "./movie-rate-info";
import type { FestivalAward } from "./movie-rows";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

export type MyRatedMovie = {
  id: string;
  title: string;
  posterUrl: string | null;
  gradient: string;
  rating: number; // 0~10
  ratedAt: string; // ISO
  awardBadge?: true;
  festivalAwards?: FestivalAward[];
};

function movieIdFromCd(movieCd: string): string {
  if (movieCd.startsWith("tmdb-tv-") || movieCd.startsWith("wikidata-")) return movieCd;
  return `kobis-${movieCd}`;
}

async function getAwardMap(movieCds: string[]): Promise<Map<string, FestivalAward[]>> {
  try {
    const awardRows = await db.cachedAwardWinners.findMany({ select: { id: true, winners: true } });
    const byTmdbId = new Map<string, FestivalAward[]>();
    for (const row of awardRows) {
      const winners = row.winners as { tmdbId?: string | null; categoryLabel?: string; ceremonyYear?: number }[];
      if (!Array.isArray(winners)) continue;
      for (const w of winners) {
        if (!w.tmdbId) continue;
        const list = byTmdbId.get(w.tmdbId) ?? [];
        list.push({ festival: row.id, categoryLabel: w.categoryLabel ?? "", year: w.ceremonyYear ?? 0 });
        byTmdbId.set(w.tmdbId, list);
      }
    }
    if (byTmdbId.size === 0) return new Map();
    const hits = await db.cachedMovie.findMany({
      where: { movieCd: { in: movieCds }, tmdbId: { in: Array.from(byTmdbId.keys()) } },
      select: { movieCd: true, tmdbId: true },
    });
    const result = new Map<string, FestivalAward[]>();
    for (const h of hits) {
      if (!h.tmdbId) continue;
      const awards = byTmdbId.get(h.tmdbId);
      if (awards) result.set(h.movieCd, awards);
    }
    return result;
  } catch {
    return new Map();
  }
}

export async function getMyRatedMovies(userId: string): Promise<MyRatedMovie[]> {
  const ratings = await db.categoryRating.findMany({
    where: { userId, category: "전체" },
    orderBy: { createdAt: "desc" },
  });
  if (ratings.length === 0) return [];

  const allMovieCds = ratings.map((r) => r.movieCd);

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

  const awardCdMap = await getAwardMap(allMovieCds);

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
      ...(awardCdMap.has(r.movieCd) ? { awardBadge: true as const, festivalAwards: awardCdMap.get(r.movieCd)! } : {}),
    };
  });
}
