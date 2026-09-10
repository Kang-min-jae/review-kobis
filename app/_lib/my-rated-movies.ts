import { db } from "./db";
import { getMovieMeta } from "./movie-rate-info";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

export type MyRatedMovie = {
  id: string; // "kobis-<movieCd>"
  title: string;
  posterUrl: string | null;
  gradient: string;
  rating: number; // 0~10
  ratedAt: string; // ISO — 처음 평점을 남긴 시각(무비 다이어리 날짜로 씀)
};

// 실제 로그인 계정으로 남긴 "전체" 평점(CategoryRateForm) — 남기는 순간 자동으로
// 무비 다이어리(그 날짜 칸)와 나만의 영화 리스트의 "내가 평점 남긴 영화" 칸에 반영된다.
// 게스트 모드 리뷰(reviews-store.ts, localStorage)와는 별개의 데이터라 여기서 따로 조회한다.
export async function getMyRatedMovies(userId: string): Promise<MyRatedMovie[]> {
  const ratings = await db.categoryRating.findMany({
    where: { userId, category: "전체" },
    orderBy: { createdAt: "desc" },
  });
  if (ratings.length === 0) return [];

  const metas = await Promise.all(ratings.map((r) => getMovieMeta(r.movieCd)));
  return ratings.map((r, i) => ({
    id: `kobis-${r.movieCd}`,
    title: metas[i]?.movieTitle ?? r.movieCd,
    posterUrl: metas[i]?.posterUrl ?? null,
    gradient: FALLBACK_GRADIENT,
    rating: r.score,
    ratedAt: r.createdAt.toISOString(),
  }));
}
