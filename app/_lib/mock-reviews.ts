export type ReviewType = "short" | "long";

export type Review = {
  id: string;
  movieId: string;
  type: ReviewType;
  rating: number; // 0 ~ 10
  content: string;
  createdAt: string; // ISO
};

// 아직 아무도 평점을 남기지 않은 초기 상태 (실제 사용자 리뷰는 reviews-store가 로컬에 쌓아 준다)
export const seedReviews: Review[] = [];
