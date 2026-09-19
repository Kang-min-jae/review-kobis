import { db } from "./db";
import { RATING_CATEGORIES, type RatingCategory } from "./category-ratings-store";
import { getBadge } from "./tier";

export type CategoryAverage = { category: RatingCategory; average: number | null; count: number };

// 항목별 페이지 사이드바(CategoryRatings)에 필요한, 6개 항목 전부의 평균+참여 수.
// review 테이블의 SHORT 한줄평을 직접 집계 — 신구 데이터 모두 반영된다.
export async function getAllCategoryAverages(movieCd: string): Promise<CategoryAverage[]> {
  const rows = await db.review.groupBy({
    by: ["category"],
    where: { movieCd, type: "SHORT" },
    _avg: { rating: true },
    _count: { rating: true },
  });
  const byCategory = new Map(rows.map((r) => [r.category as string, { average: r._avg.rating, count: r._count.rating }]));

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
  authorTier: string; // 관객 / 씨네필 / 평론가 / 거장
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
    where: { movieCd, category, type },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { nickname: true, name: true, totalLikes: true } },
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
    authorTier: getBadge(r.user.totalLikes),
    createdAt: r.createdAt.toISOString(),
    likeCount: r.likeCount,
    dislikeCount: r.dislikeCount,
    myVote: r.likes?.[0]?.type ?? null,
  }));
}

// 홈 화면 영화 카드 평균 평점 — 여러 영화의 SHORT/LONG "전체" 평점 평균을 한 번에 조회.
export async function getBulkMovieRatingAverages(
  movieCds: string[]
): Promise<Map<string, { shortAvg: number | null; longAvg: number | null }>> {
  if (movieCds.length === 0) return new Map();
  const rows = await db.review.groupBy({
    by: ["movieCd", "type"],
    where: { movieCd: { in: movieCds }, category: "전체" },
    _avg: { rating: true },
  });
  const result = new Map<string, { shortAvg: number | null; longAvg: number | null }>();
  for (const row of rows) {
    const entry = result.get(row.movieCd) ?? { shortAvg: null, longAvg: null };
    if (row.type === "SHORT") entry.shortAvg = row._avg.rating ?? null;
    else if (row.type === "LONG") entry.longAvg = row._avg.rating ?? null;
    result.set(row.movieCd, entry);
  }
  return result;
}

export type UserReviewStats = {
  movieCount: number;
  reviewCount: number;
  shortCount: number;
  longCount: number;
  shortAvg: number | null;
  longAvg: number | null;
  topLikedContent: string | null;
  topLikedCount: number;
};

export async function getUserReviewStats(userId: string): Promise<UserReviewStats> {
  const [grouped, topLiked, distinctMovies] = await Promise.all([
    db.review.groupBy({
      by: ["type"],
      where: { userId },
      _count: { _all: true },
      _avg: { rating: true },
    }),
    db.review.findFirst({
      where: { userId, likeCount: { gt: 0 } },
      orderBy: { likeCount: "desc" },
      select: { content: true, likeCount: true },
    }),
    db.review.findMany({
      where: { userId },
      select: { movieCd: true },
      distinct: ["movieCd"],
    }),
  ]);

  const byType = new Map(grouped.map((r) => [r.type, r]));
  const short = byType.get("SHORT");
  const long = byType.get("LONG");

  return {
    movieCount: distinctMovies.length,
    reviewCount: grouped.reduce((s, r) => s + r._count._all, 0),
    shortCount: short?._count._all ?? 0,
    longCount: long?._count._all ?? 0,
    shortAvg: short?._avg.rating ?? null,
    longAvg: long?._avg.rating ?? null,
    topLikedContent: topLiked?.content ?? null,
    topLikedCount: topLiked?.likeCount ?? 0,
  };
}

export type UserReview = {
  id: string;
  movieCd: string;
  movieTitle: string;
  category: string;
  type: "SHORT" | "LONG";
  rating: number;
  content: string;
  hasSpoiler: boolean;
  createdAt: string;
};

export async function getReviewsByUser(userId: string): Promise<UserReview[]> {
  const [rows, movies] = await Promise.all([
    db.review.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.cachedMovie.findMany({ select: { movieCd: true, title: true } }),
  ]);
  const titleMap = new Map(movies.map((m) => [m.movieCd, m.title]));
  return rows.map((r) => ({
    id: r.id,
    movieCd: r.movieCd,
    movieTitle: titleMap.get(r.movieCd) ?? r.movieCd,
    category: r.category,
    type: r.type as "SHORT" | "LONG",
    rating: r.rating,
    content: r.content,
    hasSpoiler: r.hasSpoiler,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getUserProfileData(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      nickname: true,
      image: true,
      totalLikes: true,
      _count: { select: { followers: true, following: true, reviews: true } },
    },
  });
}

export type MyReview = { rating: number; content: string; createdAt: string } | null;

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
  return row ? { rating: row.rating, content: row.content, createdAt: row.createdAt.toISOString() } : null;
}
