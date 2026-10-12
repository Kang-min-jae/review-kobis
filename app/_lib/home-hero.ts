// 홈 상단 히어로의 "최근 인기 영화" / "최근 BEST 영화" 패널 데이터(각 최대 5편).
//
// 기준은 이 사이트 회원이 최근 30일 동안 남긴 "전체" 평점(CategoryRating, 0~10, 1인 1편 1개)이다.
//  · 최근 인기 영화: 최근 30일 평점 개수가 많은 순 → 같으면 더 최근에 평점이 달린 순
//  · 최근 BEST 영화: 최근 30일 평점이 BEST_MIN_RATINGS개 이상인 영화 중 그 기간 평균이 높은 순 → 같으면 평점 개수 순
// 시리즈(tmdb-tv-*)·성인물·DB에 없는(삭제된) 영화는 뺀다. 10분 캐시.

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
const BEST_MIN_RATINGS = 2;
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

export type HeroLists = { popular: HeroMovie[]; best: HeroMovie[] };

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
    where: { movieCd, category: "전체", type: "SHORT", hasSpoiler: false, NOT: { content: "" } },
    orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
    take: 2,
    include: { user: { select: { nickname: true, name: true, totalLikes: true } } },
  });
  return rows.map((r) => ({
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

async function loadHeroLists(): Promise<HeroLists> {
  const stats = await loadRecentStats();
  const popular = [...stats].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
  const best = stats
    .filter((s) => s.count >= BEST_MIN_RATINGS)
    .sort((a, b) => b.average - a.average || b.count - a.count || b.lastAt - a.lastAt);
  const [popularMovies, bestMovies] = await Promise.all([toHeroMovies(popular), toHeroMovies(best)]);
  return { popular: popularMovies, best: bestMovies };
}

export const getHeroLists = unstable_cache(loadHeroLists, ["home-hero-v1"], { revalidate: 600 });
