import { db } from "./db";
import { getMovieMeta } from "./movie-rate-info";
import { formatPosterUrl } from "./formatPosterUrl";
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
      const festival = row.id.replace(/-v\d+$/, "");
      for (const w of winners) {
        if (!w.tmdbId) continue;
        const list = byTmdbId.get(w.tmdbId) ?? [];
        const award = { festival, categoryLabel: w.categoryLabel ?? "", year: w.ceremonyYear ?? 0 };
        const isDup = list.some((a) => a.festival === award.festival && a.year === award.year && a.categoryLabel === award.categoryLabel);
        if (!isDup) list.push(award);
        byTmdbId.set(w.tmdbId, list);
      }
    }
    if (byTmdbId.size === 0) return new Map();
    const result = new Map<string, FestivalAward[]>();

    // tmdb-{id} 형식 movie codes: TMDB ID가 코드 자체에 내장되어 있으므로 DB 조인 불필요
    for (const cd of movieCds) {
      if (cd.startsWith("tmdb-") && !cd.startsWith("tmdb-tv-")) {
        const tmdbId = cd.slice("tmdb-".length);
        const awards = byTmdbId.get(tmdbId);
        if (awards) result.set(cd, awards);
      }
    }

    // KOBIS/wikidata 코드: cachedMovie를 통해 tmdbId 조인
    const nonTmdbCds = movieCds.filter((cd) => !cd.startsWith("tmdb-") || cd.startsWith("tmdb-tv-"));
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
  const seriesIds = cds.filter((cd) => cd.startsWith("tmdb-tv-")).map((cd) => cd.slice("tmdb-tv-".length));
  const [movies, series] = await Promise.all([
    db.cachedMovie.findMany({
      where: { movieCd: { in: cds.filter((cd) => !cd.startsWith("tmdb-tv-")) } },
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
