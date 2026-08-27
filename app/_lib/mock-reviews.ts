export type ReviewType = "short" | "long";

export type Review = {
  id: string;
  movieId: string;
  // 영화 제목/포스터를 스냅샷으로 저장해 둔다 — KOBIS 카탈로그 영화(kobis-<movieCd>)는
  // 로컬 목데이터에 없어서 나중에 movieId만으로 다시 조회할 수 없기 때문.
  movieTitle: string;
  moviePosterUrl: string | null;
  movieGradient: string;
  // KOBIS movieCd 스냅샷 — "사용자 추천 영화"가 내가 평가한 영화의 장르를 바탕으로
  // 추천 후보를 찾을 때 사용 (KOBIS에서 못 찾은 로컬 영화는 null).
  movieCd: string | null;
  type: ReviewType;
  rating: number; // 한줄평 0~10, 장문평 0~100
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string; // ISO
};

// 아직 아무도 평점을 남기지 않은 초기 상태 (실제 사용자 리뷰는 reviews-store가 로컬에 쌓아 준다)
export const seedReviews: Review[] = [];
