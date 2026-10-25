import { db } from "./db";
import { getMovieMetas } from "./movie-rate-info";
import { formatPosterUrl } from "./formatPosterUrl";
import { getAwardDetailsByTmdbId, type FestivalAward } from "./movie-rows";
import { isSeriesCd } from "./rating-input";

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
  // 항목별 점수(전체 → 연출 → 연기 → 각본 → 음악 → 편집 순). 다른 사람 프로필에서만 채운다.
  categoryScores?: { category: string; score: number }[];
};

const CATEGORY_ORDER = ["전체", "연출", "연기", "각본", "음악", "편집"];

function movieIdFromCd(movieCd: string): string {
  if (isSeriesCd(movieCd) || movieCd.startsWith("wikidata-")) return movieCd;
  return `kobis-${movieCd}`;
}

async function getAwardMap(movieCds: string[]): Promise<Map<string, FestivalAward[]>> {
  try {
    const byTmdbId = await getAwardDetailsByTmdbId();
    if (byTmdbId.size === 0) return new Map();
    const result = new Map<string, FestivalAward[]>();

    // tmdb-{id} 형식 movie codes: TMDB ID가 코드 자체에 내장되어 있으므로 DB 조인 불필요
    for (const cd of movieCds) {
      if (cd.startsWith("tmdb-") && !isSeriesCd(cd)) {
        const tmdbId = cd.slice("tmdb-".length);
        const awards = byTmdbId.get(tmdbId);
        if (awards) result.set(cd, awards);
      }
    }

    // KOBIS/wikidata 코드: cachedMovie를 통해 tmdbId 조인
    const nonTmdbCds = movieCds.filter((cd) => !cd.startsWith("tmdb-") || isSeriesCd(cd));
    if (nonTmdbCds.length > 0) {
      const hits = await db.cachedMovie.findMany({
        where: { movieCd: { in: nonTmdbCds }, tmdbId: { in: Array.from(byTmdbId.keys()) } },
        select: { movieCd: true, tmdbId: true },
      });
      for (const h of hits) {
        if (!h.tmdbId) continue;
        const awards = byTmdbId.get(h.tmdbId);
        if (awards) result.set(h.movieCd, awards);
      }
    }

    return result;
  } catch {
    return new Map();
  }
}

async function getRatingsIncludingCategoryOnly(
  userId: string,
): Promise<{ movieCd: string; score: number; createdAt: Date; categoryScores: { category: string; score: number }[] }[]> {
  const rows = await db.categoryRating.findMany({ where: { userId }, select: { movieCd: true, category: true, score: true, createdAt: true } });
  const byMovie = new Map<string, { overall: number | null; sum: number; count: number; createdAt: Date; scores: { category: string; score: number }[] }>();
  for (const r of rows) {
    const entry = byMovie.get(r.movieCd) ?? { overall: null, sum: 0, count: 0, createdAt: r.createdAt, scores: [] };
    entry.scores.push({ category: r.category, score: r.score });
    if (r.category === "전체") entry.overall = r.score;
    else { entry.sum += r.score; entry.count += 1; }
    if (r.createdAt > entry.createdAt) entry.createdAt = r.createdAt;
    byMovie.set(r.movieCd, entry);
  }
  return [...byMovie.entries()]
    .map(([movieCd, e]) => ({
      movieCd,
      score: e.overall ?? Math.round((e.sum / e.count) * 10) / 10,
      createdAt: e.createdAt,
      categoryScores: e.scores.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)),
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// includeCategoryOnly: "전체" 평점 없이 항목(연출·편집 등)에만 평가한 영화도 포함한다 —
// 그런 영화는 그 사람이 남긴 항목 점수 평균을 평점으로 쓴다. 다른 사람 프로필에서만 켠다
// (내 리스트·다이어리의 "계정 평점" 삭제는 "전체" 평점 기준이라 거기엔 섞지 않는다).
export async function getMyRatedMovies(
  userId: string,
  options: { includeCategoryOnly?: boolean } = {},
): Promise<MyRatedMovie[]> {
  const ratings = options.includeCategoryOnly
    ? await getRatingsIncludingCategoryOnly(userId)
    : await db.categoryRating.findMany({
        where: { userId, category: "전체" },
        orderBy: { createdAt: "desc" },
      });
  if (ratings.length === 0) return [];

  const allMovieCds = ratings.map((r) => r.movieCd);

  // KOBIS 코드(숫자)만 movie-rate-info로 메타 조회; 시리즈/wikidata는 DB 캐시 직접 조회
  // 카드에 필요한 제목·포스터만 한 번에 읽는다(영화마다 따로, 행 전체를 읽지 않는다).
  const kobishMetaMap = await getMovieMetas(ratings.filter((r) => /^\d+$/.test(r.movieCd)).map((r) => r.movieCd));

  const seriesIds = ratings
    .filter((r) => isSeriesCd(r.movieCd))
    .map((r) => r.movieCd.slice("tmdb-tv-".length));
  const seriesCache = seriesIds.length > 0
    ? await db.cachedSeries.findMany({ where: { tmdbId: { in: seriesIds } }, select: { tmdbId: true, name: true, posterUrl: true } }).catch(() => [])
    : [];
  const seriesMap = new Map(seriesCache.map((s) => [`tmdb-tv-${s.tmdbId}`, s]));

  const wikidataIds = ratings
    .filter((r) => r.movieCd.startsWith("wikidata-"))
    .map((r) => r.movieCd);
  const wikidataCache = wikidataIds.length > 0
    ? await db.cachedMovie.findMany({ where: { movieCd: { in: wikidataIds } }, select: { movieCd: true, title: true, posterUrl: true } }).catch(() => [])
    : [];
  const wikidataMap = new Map(wikidataCache.map((m) => [m.movieCd, m]));

  const awardCdMap = await getAwardMap(allMovieCds);

  return ratings.map((r) => {
    let title = r.movieCd;
    let posterUrl: string | null = null;

    if (isSeriesCd(r.movieCd)) {
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
      ...("categoryScores" in r ? { categoryScores: r.categoryScores } : {}),
      ...(awardCdMap.has(r.movieCd) ? { awardBadge: true as const, festivalAwards: awardCdMap.get(r.movieCd)! } : {}),
    };
  });
}

// 브라우저 localStorage의 "내 리뷰"를 서버 기준으로 맞출 때 쓰는 데이터. id는 DB
// 리뷰 id를 그대로 쓰고, 제목·포스터는 외부 API 없이 DB 캐시에서만 채운다.
export type SyncedReview = {
  id: string;
  movieId: string;
  movieCd: string | null;
  movieTitle: string;
  moviePosterUrl: string | null;
  movieGradient: string;
  type: "short" | "long";
  category: string;
  rating: number;
  content: string;
  createdAt: string;
};

export async function getMyReviewsForSync(userId: string): Promise<SyncedReview[]> {
  const reviews = await db.review.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  if (reviews.length === 0) return [];

  const cds = Array.from(new Set(reviews.map((r) => r.movieCd)));
  const seriesIds = cds.filter((cd) => isSeriesCd(cd)).map((cd) => cd.slice("tmdb-tv-".length));
  const [movies, series] = await Promise.all([
    db.cachedMovie.findMany({
      where: { movieCd: { in: cds.filter((cd) => !isSeriesCd(cd)) } },
      select: { movieCd: true, title: true, posterUrl: true },
    }),
    seriesIds.length > 0
      ? db.cachedSeries.findMany({ where: { tmdbId: { in: seriesIds } }, select: { tmdbId: true, name: true, posterUrl: true } })
      : Promise.resolve([]),
  ]);
  const info = new Map<string, { title: string; posterUrl: string | null }>([
    ...movies.map((m) => [m.movieCd, { title: m.title, posterUrl: m.posterUrl }] as const),
    ...series.map((s) => [`tmdb-tv-${s.tmdbId}`, { title: s.name, posterUrl: s.posterUrl }] as const),
  ]);

  return reviews.map((r) => {
    const movie = info.get(r.movieCd);
    return {
      id: r.id,
      movieId: movieIdFromCd(r.movieCd),
      movieCd: /^\d+$/.test(r.movieCd) ? r.movieCd : null,
      movieTitle: movie?.title ?? r.movieCd,
      moviePosterUrl: formatPosterUrl(movie?.posterUrl ?? null),
      movieGradient: FALLBACK_GRADIENT,
      type: r.type === "SHORT" ? "short" : "long",
      category: r.category,
      rating: r.rating,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    };
  });
}
