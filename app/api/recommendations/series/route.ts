import { NextResponse } from "next/server";
import { db } from "../../../_lib/db";
import { getTmdbPopularSeries } from "../../../_lib/tmdb";
import { splitGenres } from "../../../_lib/movie-rows";
import type { RowMovie } from "../../../_lib/movie-rows";
import { getBulkMovieRatingAverages } from "../../../_lib/review-data";
import { canonicalGenres, genreQueryKeywords } from "../../../_lib/genre-canon";
import { sanitizeCategoryRatings, sanitizeRatings, type RatingInput } from "../../../_lib/rating-input";
import { recencyDecay } from "../../../_lib/calculateAffinity";
import { buildTasteContext, loadQualityStats, scoreAffinity, type TasteContext } from "../../../_lib/affinity-data";

// 외부 API·AI 응답이 늦어도 이 시간 안에 끝낸다(함수가 오래 붙잡혀 사용량이 늘지 않게).
export const maxDuration = 30;

// 다른 행의 카드처럼 사이트 평점(한줄평·장문평 평균과 평가 인원)을 붙인다.
async function withRatings(results: RowMovie[]): Promise<RowMovie[]> {
  const avgMap = await getBulkMovieRatingAverages(results.map((r) => r.id));
  return results.map((r) => {
    const avgs = avgMap.get(r.id);
    return { ...r, shortAvg: avgs?.shortAvg ?? null, shortCount: avgs?.shortCount ?? null, longAvg: avgs?.longAvg ?? null };
  });
}

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

const CURATED_SERIES_IDS = [
  "93405", "128064", "4613", "87108", "1396",
  "95396", "63333", "71446", "1399", "60059",
  "84958", "100088", "76479", "94997", "202555",
];

function getTemporalWeight(rating: number, ratedAt: string | null, totalCount: number): number {
  return (rating - 5) * recencyDecay(ratedAt, totalCount);
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

// 시리즈 메타는 buildTasteContext가 이미 읽어 둔 것(taste.ratedMetas, 대표 장르)을 쓴다.
function buildSeriesProfile(ratings: RatingInput[], taste: TasteContext) {
  const seriesRatings = ratings.filter((r) => r.movieId.startsWith("tmdb-tv-"));
  if (seriesRatings.length === 0) return { coldStart: true, genreVec: {} as Record<string, number>, avoidedGenreVec: {} as Record<string, number> };

  const genreVec: Record<string, number> = {};
  const avoidedGenreVec: Record<string, number> = {};

  for (const rating of seriesRatings) {
    const meta = taste.ratedMetas.get(rating.movieId);
    if (!meta) continue;
    const w = getTemporalWeight(rating.rating, rating.ratedAt, seriesRatings.length);
    for (const g of meta.genres) {
      if (rating.rating >= 7.0) genreVec[g] = (genreVec[g] ?? 0) + w;
      if (rating.rating <= 3.0) avoidedGenreVec[g] = (avoidedGenreVec[g] ?? 0) + Math.abs(w);
    }
  }

  return { coldStart: false, genreVec, avoidedGenreVec };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ results: [] });
  }

  try {
    return NextResponse.json({ results: await recommendSeries(body) });
  } catch (error) {
    console.warn("[recommendations/series] 추천 계산 실패:", error);
    return NextResponse.json({ results: [] });
  }
}

async function recommendSeries(body: unknown): Promise<RowMovie[]> {
  // 입력은 브라우저 localStorage에서 온 값이라 형식·범위를 검증한다(rating-input.ts).
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const myRatings = sanitizeRatings(input.myRatings);
  const ratedSeriesIds = new Set(myRatings.filter((r) => r.movieId.startsWith("tmdb-tv-")).map((r) => r.movieId));

  // 추천도 배지는 영화 평점까지 포함한 전체 취향으로, 다른 행과 같은 공식(affinity-data.ts)으로 계산한다.
  const taste = await buildTasteContext(myRatings, sanitizeCategoryRatings(input.myCategoryRatings));
  const profile = buildSeriesProfile(myRatings, taste);

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

    // 대표 장르 → 출처별 표기로 풀어서 검색한다("모험" → "어드벤처"·"모험", TMDB 시리즈의
    // "액션 & 어드벤처"는 "액션"·"어드벤처" 둘 다로 잡힌다).
    const genreKeywords = [...new Set(topGenres.flatMap(genreQueryKeywords))];
    const [byGenre, recent] = await Promise.all([
      genreKeywords.length > 0
        ? db.cachedSeries.findMany({
            where: { posterUrl: { not: null }, OR: genreKeywords.map((g) => ({ genreAlt: { contains: g } })) },
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
    const popular = await getTmdbPopularSeries().catch(() => []);
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
    return withRatings(results);
  }

  // 사이트 평점 집계 — 추천도 배지와 같은 재료(CategoryRating, 한줄평·장문평 모두 반영)
  const qualityStats = await loadQualityStats(candidates.map((c) => `tmdb-tv-${c.tmdbId}`));
  const reviewedSeries = [...qualityStats.values()].filter((q) => q.overallAvg !== null && q.overallCount > 0);
  const catalogMean = reviewedSeries.length > 0
    ? reviewedSeries.reduce((s, q) => s + q.overallAvg!, 0) / reviewedSeries.length
    : 7.0;

  const scored = candidates.map((c) => {
    const allGenres = splitGenres(c.genreAlt);
    const genres = canonicalGenres(allGenres);
    const movieGenreVec: Record<string, number> = Object.fromEntries(genres.map((g) => [g, 1]));

    // Bayesian quality score
    const quality = qualityStats.get(`tmdb-tv-${c.tmdbId}`);
    const v = quality?.overallCount ?? 0;
    const R = quality?.overallAvg ?? catalogMean;
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

    // 카드의 "추천 N%"는 모든 행 공통 추천도 — /api/affinity가 같은 시리즈에 주는 숫자와 같다.
    const recommendScore = scoreAffinity({ genres, directorName: null, castNames: [], tmdbId: null }, taste.ctx, quality);
    return { ...c, allGenres, genres, totalScore, recommendScore };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);

  // Genre diversity: max 50% cap (7 of 15), take top 15
  const result: typeof scored = [];
  const genreCount = new Map<string, number>();
  const genreCap = 7;

  for (const c of scored) {
    if (result.length >= 15) break;
    if (c.genres.length > 0 && c.genres.some((g) => (genreCount.get(g) ?? 0) >= genreCap)) continue;
    for (const g of c.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
    result.push(c);
  }

  // Fill to 15 if diversity pruned too many
  if (result.length < 8) {
    for (const c of scored) {
      if (result.length >= 15) break;
      if (!result.includes(c)) result.push(c);
    }
  }

  const results: RowMovie[] = result
    .filter((c) => c.posterUrl !== null)
    .map((c) => ({
      id: `tmdb-tv-${c.tmdbId}`,
      title: c.name,
      posterUrl: c.posterUrl,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: false,
      genre: c.allGenres.length > 0 ? c.allGenres.slice(0, 2).join(" · ") : null,
      allGenres: c.allGenres,
      ...(c.recommendScore !== null ? { recommendScore: c.recommendScore } : {}),
    }));

  // 화면엔 추천도(%) 높은 순으로 보여준다(고르는 것은 위의 순위 점수, 동점이면 그 순서 유지).
  if (taste.ctx.hasData) results.sort((a, b) => (b.recommendScore ?? 0) - (a.recommendScore ?? 0));

  return withRatings(results);
}

export async function GET() {
  return NextResponse.json({ results: [] });
}
