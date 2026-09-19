import { NextResponse } from "next/server";
import { db } from "../../../_lib/db";
import { getTmdbPopularSeries } from "../../../_lib/tmdb";
import { splitGenres } from "../../../_lib/movie-rows";
import type { RowMovie } from "../../../_lib/movie-rows";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

const CURATED_SERIES_IDS = [
  "93405", "128064", "4613", "87108", "1396",
  "95396", "63333", "71446", "1399", "60059",
  "84958", "100088", "76479", "94997", "202555",
];

type IncomingRating = {
  movieId: string; // "tmdb-tv-{tmdbId}"
  rating: number;
  ratedAt: string;
};

type RequestBody = {
  myRatings: IncomingRating[];
  myCategoryRatings: { movieId: string; category: string; value: number }[];
};

function getTemporalWeight(rating: number, ratedAt: string, totalCount: number): number {
  const daysDiff = (Date.now() - new Date(ratedAt).getTime()) / 86400000;
  const halfLifeDays = totalCount < 10 ? 180 : totalCount < 30 ? 120 : 90;
  const timeWeight = Math.pow(0.5, daysDiff / halfLifeDays);
  return (rating - 5) * timeWeight;
}

function cosineSimilarity(userVec: Record<string, number>, movieVec: Record<string, number>): number {
  let dot = 0, userNorm = 0, movieNorm = 0;
  for (const k in userVec) userNorm += userVec[k] ** 2;
  for (const k in movieVec) {
    movieNorm += movieVec[k] ** 2;
    if (userVec[k]) dot += userVec[k] * movieVec[k];
  }
  if (userNorm === 0 || movieNorm === 0) return 0;
  return dot / (Math.sqrt(userNorm) * Math.sqrt(movieNorm));
}

async function buildSeriesProfile(ratings: IncomingRating[]) {
  const seriesRatings = ratings.filter((r) => r.movieId.startsWith("tmdb-tv-"));
  if (seriesRatings.length === 0) return { coldStart: true, genreVec: {} as Record<string, number>, avoidedGenreVec: {} as Record<string, number> };

  const tmdbIds = seriesRatings.map((r) => r.movieId.slice("tmdb-tv-".length));
  const cachedSeries = await db.cachedSeries.findMany({
    where: { tmdbId: { in: tmdbIds } },
    select: { tmdbId: true, genreAlt: true },
  });
  const seriesMeta = new Map(cachedSeries.map((s) => [s.tmdbId, s]));

  const genreVec: Record<string, number> = {};
  const avoidedGenreVec: Record<string, number> = {};

  for (const rating of seriesRatings) {
    const tmdbId = rating.movieId.slice("tmdb-tv-".length);
    const meta = seriesMeta.get(tmdbId);
    if (!meta) continue;
    const w = getTemporalWeight(rating.rating, rating.ratedAt, seriesRatings.length);
    for (const g of splitGenres(meta.genreAlt)) {
      if (rating.rating >= 7.0) genreVec[g] = (genreVec[g] ?? 0) + w;
      if (rating.rating <= 3.0) avoidedGenreVec[g] = (avoidedGenreVec[g] ?? 0) + Math.abs(w);
    }
  }

  return { coldStart: false, genreVec, avoidedGenreVec };
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return NextResponse.json({ results: [] });
  }

  const { myRatings = [] } = body;
  const ratedSeriesIds = new Set(myRatings.filter((r) => r.movieId.startsWith("tmdb-tv-")).map((r) => r.movieId));

  const profile = await buildSeriesProfile(myRatings);

  // Get candidates from CachedSeries
  type SeriesCandidate = { tmdbId: string; name: string; posterUrl: string | null; genreAlt: string | null };
  let candidates: SeriesCandidate[] = [];

  if (profile.coldStart) {
    candidates = await db.cachedSeries.findMany({
      where: { tmdbId: { in: CURATED_SERIES_IDS }, posterUrl: { not: null } },
      select: { tmdbId: true, name: true, posterUrl: true, genreAlt: true },
    }).catch(() => []);
  } else {
    const topGenres = Object.entries(profile.genreVec)
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g]) => g);

    const [byGenre, recent] = await Promise.all([
      topGenres.length > 0
        ? db.cachedSeries.findMany({
            where: { posterUrl: { not: null }, OR: topGenres.map((g) => ({ genreAlt: { contains: g } })) },
            select: { tmdbId: true, name: true, posterUrl: true, genreAlt: true },
            take: 60,
          }).catch(() => [] as SeriesCandidate[])
        : Promise.resolve([] as SeriesCandidate[]),
      db.cachedSeries.findMany({
        where: { posterUrl: { not: null } },
        orderBy: { updatedAt: "desc" },
        select: { tmdbId: true, name: true, posterUrl: true, genreAlt: true },
        take: 40,
      }).catch(() => [] as SeriesCandidate[]),
    ]);

    const seen = new Set<string>();
    for (const s of [...byGenre, ...recent]) {
      if (!seen.has(s.tmdbId) && !ratedSeriesIds.has(`tmdb-tv-${s.tmdbId}`)) {
        seen.add(s.tmdbId);
        candidates.push(s);
      }
    }
  }

  candidates = candidates.filter((c) => !ratedSeriesIds.has(`tmdb-tv-${c.tmdbId}`));

  // Fall back to TMDB popular if DB has no series data
  if (candidates.length === 0) {
    try {
      const popular = await getTmdbPopularSeries();
      const results: RowMovie[] = popular
        .filter((s) => s.posterUrl && !ratedSeriesIds.has(`tmdb-tv-${s.tmdbId}`))
        .slice(0, 15)
        .map((s) => ({
          id: `tmdb-tv-${s.tmdbId}`,
          title: s.name,
          posterUrl: s.posterUrl,
          gradient: FALLBACK_GRADIENT,
          isNowShowing: false,
          genre: null,
          allGenres: [],
        }));
      return NextResponse.json({ results });
    } catch {
      return NextResponse.json({ results: [] });
    }
  }

  // Batch-fetch review averages for quality scoring
  const tmdbIds = candidates.map((c) => c.tmdbId);
  const reviewData = new Map<string, { avg: number | null; count: number }>();
  try {
    const groups = await db.review.groupBy({
      by: ["movieCd"],
      where: { movieCd: { in: tmdbIds.map((id) => `tmdb-tv-${id}`) }, type: "SHORT", category: "전체" },
      _avg: { rating: true },
      _count: { _all: true },
    });
    for (const g of groups) {
      reviewData.set(g.movieCd.slice("tmdb-tv-".length), { avg: g._avg.rating, count: g._count._all });
    }
  } catch { /* no reviews yet — quality scoring falls back to neutral */ }

  const reviewedSeries = [...reviewData.values()].filter((d) => d.avg !== null && d.count > 0);
  const catalogMean = reviewedSeries.length > 0
    ? reviewedSeries.reduce((s, d) => s + d.avg!, 0) / reviewedSeries.length
    : 7.0;

  const scored = candidates.map((c) => {
    const allGenres = splitGenres(c.genreAlt);
    const movieGenreVec: Record<string, number> = Object.fromEntries(allGenres.map((g) => [g, 1]));

    // Bayesian quality score
    const rev = reviewData.get(c.tmdbId);
    const v = rev?.count ?? 0;
    const R = rev?.avg ?? catalogMean;
    const m = 20;
    const qualityScore = ((v / (v + m)) * R + (m / (v + m)) * catalogMean) / 10;

    let totalScore: number;
    if (profile.coldStart) {
      totalScore = qualityScore;
    } else {
      const genreSim = cosineSimilarity(profile.genreVec, movieGenreVec);
      const avoidedGenreSim = cosineSimilarity(profile.avoidedGenreVec, movieGenreVec);
      totalScore = Math.max(0, Math.min(1, 0.6 * genreSim + 0.4 * qualityScore - 0.15 * avoidedGenreSim));
    }

    return { ...c, allGenres, totalScore };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);

  // Genre diversity: max 50% cap (7 of 15), take top 15
  const result: typeof scored = [];
  const genreCount = new Map<string, number>();
  const genreCap = 7;

  for (const c of scored) {
    if (result.length >= 15) break;
    if (c.allGenres.length > 0 && c.allGenres.some((g) => (genreCount.get(g) ?? 0) >= genreCap)) continue;
    for (const g of c.allGenres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
    result.push(c);
  }

  // Fill to 15 if diversity pruned too many
  if (result.length < 8) {
    for (const c of scored) {
      if (result.length >= 15) break;
      if (!result.includes(c)) result.push(c);
    }
  }

  const results: RowMovie[] = result.map((c) => {
    const rawScore = Math.round(100 * c.totalScore);
    const recommendScore = profile.coldStart
      ? undefined
      : Math.min(99, Math.max(1, rawScore));
    return {
      id: `tmdb-tv-${c.tmdbId}`,
      title: c.name,
      posterUrl: c.posterUrl,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: false,
      genre: c.allGenres.length > 0 ? c.allGenres.slice(0, 2).join(" · ") : null,
      allGenres: c.allGenres,
      recommendScore,
    };
  });

  return NextResponse.json({ results: results.filter((r) => r.posterUrl !== null) });
}

export async function GET() {
  return NextResponse.json({ results: [] });
}
