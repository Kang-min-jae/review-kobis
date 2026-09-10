import { db } from "./db";
import { RATING_CATEGORIES, type RatingCategory } from "./category-ratings-store";

export type CategoryAverage = { category: RatingCategory; average: number | null; count: number };

// 항목별 페이지 사이드바(CategoryRatings)에 필요한, 6개 항목 전부의 평균+참여 수.
export async function getAllCategoryAverages(movieCd: string): Promise<CategoryAverage[]> {
  const rows = await db.categoryRating.groupBy({
    by: ["category"],
    where: { movieCd },
    _avg: { score: true },
    _count: { score: true },
  });
  const byCategory = new Map(rows.map((r) => [r.category, { average: r._avg.score, count: r._count.score }]));

  return RATING_CATEGORIES.map((category) => ({
    category,
    average: byCategory.get(category)?.average ?? null,
    count: byCategory.get(category)?.count ?? 0,
  }));
}

// 지금 로그인한 사람이 이 영화의 이 항목에 이미 남긴 빠른 별점(있으면). userId는
// 페이지에서 auth()를 한 번만 호출해 넘겨준다 — 요청마다 세션 조회가 여러 번
// 중복되지 않게 하기 위함.
export async function getMyCategoryScore(
  userId: string | null,
  movieCd: string,
  category: string
): Promise<number | null> {
  if (!userId) return null;
  const row = await db.categoryRating.findUnique({
    where: { userId_movieCd_category: { userId, movieCd, category } },
  });
  return row?.score ?? null;
}

export type ReviewWithAuthor = {
  id: string;
  rating: number;
  content: string;
  hasSpoiler: boolean;
  authorId: string;
  authorName: string;
  createdAt: string;
  likeCount: number;
  dislikeCount: number;
  myVote: "LIKE" | "DISLIKE" | null;
};

// userId를 주면, 지금 로그인한 사람이 이 리뷰들에 남긴 투표(있으면)를 myVote에
// 같이 채워서 반환한다 — 별도 요청으로 리뷰 개수만큼 조회하지 않도록 한 번에 가져온다.
export async function getReviewsForCategoryType(
  movieCd: string,
  category: string,
  type: "SHORT" | "LONG",
  userId: string | null
): Promise<ReviewWithAuthor[]> {
  const rows = await db.review.findMany({
    // 글 없이 평점만 남겨서 생긴 빈 한줄평(submitCategoryRatingAction 참고)은 다른
    // 사람에게 보여줄 목록에선 뺀다 — 빈 리뷰 항목을 목록에 보여줄 필요는 없다.
    where: { movieCd, category, type, content: { not: "" } },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { nickname: true, name: true } },
      likes: userId ? { where: { userId }, select: { type: true } } : false,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    content: r.content,
    hasSpoiler: r.hasSpoiler,
    authorId: r.userId,
    authorName: r.user.nickname ?? r.user.name ?? "사용자",
    createdAt: r.createdAt.toISOString(),
    likeCount: r.likeCount,
    dislikeCount: r.dislikeCount,
    myVote: r.likes?.[0]?.type ?? null,
  }));
}

export type MyReview = { rating: number; content: string } | null;

// 지금 로그인한 사람이 이 영화의 이 항목·타입(한줄평/장문평)에 이미 남긴 리뷰(있으면).
export async function getMyReview(
  userId: string | null,
  movieCd: string,
  category: string,
  type: "SHORT" | "LONG"
): Promise<MyReview> {
  if (!userId) return null;
  const row = await db.review.findFirst({
    where: { userId, movieCd, category, type },
  });
  return row ? { rating: row.rating, content: row.content } : null;
}
