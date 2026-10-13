// 홈 상단 히어로의 "최근 인기 영화" / "오늘의 한줄평" 패널 데이터(각 최대 5개).
//
//  · 최근 인기 영화: 이 사이트 회원이 최근 30일 동안 남긴 "전체" 평점(CategoryRating, 1인 1편 1개) 개수가
//    많은 순 → 같으면 더 최근에 평점이 달린 순.
//  · 좋아요 많은 한줄평(영화 카드 아래 2개): 좋아요 순 → 같으면 글이 있는 리뷰 먼저 → 최근 순. 평점만 남긴
//    리뷰도 포함한다(화면엔 "평점만 남김"으로 표시). 스포일러는 뺀다.
//  · 오늘의 한줄평: 최근 7일 동안 받은 좋아요가 많은 한줄평 순 → 모자라면 최근 7일에 쓰인 한줄평 중
//    좋아요 많은 순으로 채운다. 스포일러·빈 글·시리즈는 뺀다.
// 성인물·DB에 없는(삭제된) 영화는 뺀다. 10분 캐시 — 좋아요·리뷰가 바뀌면 HOME_HERO_TAG로 바로 무효화한다.

import { unstable_cache } from "next/cache";
import { db } from "./db";
import { cdToMovieId } from "./rating-input";
import { formatPosterUrl } from "./formatPosterUrl";
import { getBulkMovieRatingAverages } from "./review-data";
import { getKoficBoxOfficeByTitle } from "./kobis";
import { isAdultContent } from "./adult-content";
import { getBadge } from "./tier";

export const HERO_WINDOW_DAYS = 30;
export const HERO_MOVIE_COUNT = 5;
export const TODAY_REVIEW_DAYS = 7;
// 좋아요·리뷰 등록/수정/삭제 서버 액션이 updateTag(HOME_HERO_TAG)로 히어로 캐시를 바로 지운다.
export const HOME_HERO_TAG = "home-hero";
const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

export type HeroReview = {
  id: string;
  authorId: string;
  authorName: string;
  authorTier: string;
  rating: number; // 0~10
  likeCount: number;
  content: string;
};

export type HeroMovie = {
  rank: number;
  movieId: string;
  title: string;
  posterUrl: string | null;
  gradient: string;
  average: number | null; // 회원 "전체" 한줄평 평균(0~10, 전체 기간)
  ratingCount: number; // 회원 평가 수(전체 기간)
  recentCount: number; // 최근 30일 평가 수
  recentAverage: number; // 최근 30일 평균
  audiAcc: number | null; // 누적 관객(현재 박스오피스 상영작만)
  reviews: HeroReview[]; // 좋아요 많은 한줄평 최대 2개(스포일러 제외)
};

export type HeroTodayReview = {
  id: string;
  content: string;
  rating: number; // 0~10
  likeCount: number;
  createdAt: string; // ISO
  authorId: string;
  authorName: string;
  authorTier: string;
  movieId: string;
  movieTitle: string;
  posterUrl: string | null;
  genre: string | null;
};

export type HeroLists = { popular: HeroMovie[]; today: HeroTodayReview[] };

type RecentStat = { movieCd: string; count: number; average: number; lastAt: number };

async function loadRecentStats(): Promise<RecentStat[]> {
  const since = new Date(Date.now() - HERO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db.categoryRating.groupBy({
    by: ["movieCd"],
    where: { category: "전체", createdAt: { gte: since }, NOT: { movieCd: { startsWith: "tmdb-tv-" } } },
    _count: { _all: true },
    _avg: { score: true },
    _max: { createdAt: true },
  });
  return rows.map((r) => ({
    movieCd: r.movieCd,
    count: r._count._all,
    average: r._avg.score ?? 0,
    lastAt: r._max.createdAt?.getTime() ?? 0,
  }));
}

async function topReviews(movieCd: string): Promise<HeroReview[]> {
  const rows = await db.review.findMany({
    where: { movieCd, category: "전체", type: "SHORT", hasSpoiler: false },
    orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
    take: 10,
    include: { user: { select: { nickname: true, name: true, totalLikes: true } } },
  });
  // 좋아요가 같으면 글이 있는 리뷰를 평점만 남긴 리뷰보다 앞에 둔다(정렬은 안정적이라 그 안에선 최근 순 유지).
  const hasText = (content: string) => (content.trim() ? 1 : 0);
  rows.sort((a, b) => b.likeCount - a.likeCount || hasText(b.content) - hasText(a.content));
  return rows.slice(0, 2).map((r) => ({
    id: r.id,
    authorId: r.userId,
    authorName: r.user.nickname ?? r.user.name ?? "사용자",
    authorTier: getBadge(r.user.totalLikes),
    rating: r.rating,
    likeCount: r.likeCount,
    content: r.content,
  }));
}

// 정렬된 후보에서 DB에 있고 성인물이 아닌 영화만 골라 최대 5편을 카드로 만든다.
async function toHeroMovies(sorted: RecentStat[]): Promise<HeroMovie[]> {
  const candidates = sorted.slice(0, HERO_MOVIE_COUNT * 4);
  if (candidates.length === 0) return [];
  const cached = await db.cachedMovie.findMany({
    where: { movieCd: { in: candidates.map((c) => c.movieCd) } },
    select: { movieCd: true, title: true, posterUrl: true, genreAlt: true },
  });
  const byCd = new Map(cached.map((m) => [m.movieCd, m]));
  const picked = candidates
    .filter((c) => {
      const m = byCd.get(c.movieCd);
      return m && !isAdultContent(m);
    })
    .slice(0, HERO_MOVIE_COUNT);

  const cds = picked.map((p) => p.movieCd);
  const [avgs, reviews, audiences] = await Promise.all([
    getBulkMovieRatingAverages(cds),
    Promise.all(cds.map((cd) => topReviews(cd).catch(() => []))),
    // 누적 관객은 KOBIS 일별 박스오피스에 오른 영화(현재 상영작)만 알 수 있다.
    Promise.all(
      picked.map((p) =>
        /^\d+$/.test(p.movieCd)
          ? getKoficBoxOfficeByTitle(byCd.get(p.movieCd)!.title).catch(() => null)
          : Promise.resolve(null)
      )
    ),
  ]);

  return picked.map((p, i) => {
    const m = byCd.get(p.movieCd)!;
    const a = avgs.get(p.movieCd);
    return {
      rank: i + 1,
      movieId: cdToMovieId(p.movieCd),
      title: m.title,
      posterUrl: formatPosterUrl(m.posterUrl),
      gradient: FALLBACK_GRADIENT,
      average: a?.shortAvg ?? null,
      ratingCount: a?.shortCount ?? 0,
      recentCount: p.count,
      recentAverage: Math.round(p.average * 10) / 10,
      audiAcc: audiences[i]?.audiAcc ?? null,
      reviews: reviews[i],
    };
  });
}

async function loadTodayReviews(): Promise<HeroTodayReview[]> {
  const since = new Date(Date.now() - TODAY_REVIEW_DAYS * 24 * 60 * 60 * 1000);
  const eligible = { type: "SHORT" as const, hasSpoiler: false, NOT: [{ content: "" }, { movieCd: { startsWith: "tmdb-tv-" } }] };

  // 최근 7일에 받은 좋아요 수 순
  const liked = await db.reviewLike.groupBy({
    by: ["reviewId"],
    where: { type: "LIKE", createdAt: { gte: since }, review: eligible },
    _count: { _all: true },
    orderBy: { _count: { reviewId: "desc" } },
    take: 20,
  });
  // 모자라면 최근 7일에 쓰인 한줄평 중 좋아요 많은 순
  const recent = await db.review.findMany({
    where: { ...eligible, createdAt: { gte: since } },
    orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
    select: { id: true },
    take: 20,
  });
  const orderedIds = [...new Set([...liked.map((l) => l.reviewId), ...recent.map((r) => r.id)])];
  if (orderedIds.length === 0) return [];

  const rows = await db.review.findMany({
    where: { id: { in: orderedIds } },
    include: { user: { select: { nickname: true, name: true, totalLikes: true } } },
  });
  const movies = await db.cachedMovie.findMany({
    where: { movieCd: { in: [...new Set(rows.map((r) => r.movieCd))] } },
    select: { movieCd: true, title: true, posterUrl: true, genreAlt: true },
  });
  const movieByCd = new Map(movies.map((m) => [m.movieCd, m]));
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const result: HeroTodayReview[] = [];
  for (const id of orderedIds) {
    if (result.length >= HERO_MOVIE_COUNT) break;
    const r = rowById.get(id);
    const m = r ? movieByCd.get(r.movieCd) : undefined;
    if (!r || !m || isAdultContent(m)) continue;
    result.push({
      id: r.id,
      content: r.content,
      rating: r.rating,
      likeCount: r.likeCount,
      createdAt: r.createdAt.toISOString(),
      authorId: r.userId,
      authorName: r.user.nickname ?? r.user.name ?? "사용자",
      authorTier: getBadge(r.user.totalLikes),
      movieId: cdToMovieId(r.movieCd),
      movieTitle: m.title,
      posterUrl: formatPosterUrl(m.posterUrl),
      genre: m.genreAlt?.split(",")[0]?.trim() || null,
    });
  }
  return result;
}

async function loadHeroLists(): Promise<HeroLists> {
  const stats = await loadRecentStats();
  const popular = [...stats].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
  const [popularMovies, today] = await Promise.all([toHeroMovies(popular), loadTodayReviews()]);
  return { popular: popularMovies, today };
}

export const getHeroLists = unstable_cache(loadHeroLists, ["home-hero-v3"], { revalidate: 600, tags: [HOME_HERO_TAG] });
