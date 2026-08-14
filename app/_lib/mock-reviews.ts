export type ReviewType = "short" | "long";

export type Review = {
  id: string;
  movieId: string;
  // 영화 제목/포스터를 스냅샷으로 저장해 둔다 — TMDB 카탈로그 영화(tmdb-<id>)는
  // 로컬 목데이터에 없어서 나중에 movieId만으로 다시 조회할 수 없기 때문.
  movieTitle: string;
  moviePosterUrl: string | null;
  movieGradient: string;
  type: ReviewType;
  rating: number; // 한줄평 0~10, 장문평 0~100
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string; // ISO
};

// 아직 아무도 평점을 남기지 않은 초기 상태 (실제 사용자 리뷰는 reviews-store가 로컬에 쌓아 준다)
export const seedReviews: Review[] = [];
