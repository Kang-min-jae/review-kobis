import { db } from "./db";
import { RATING_CATEGORIES, type RatingCategory } from "./category-ratings-store";
import { getBadge } from "./tier";
import { SPOILER_PLACEHOLDER } from "./spoiler";

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
  // 스포일러 리뷰는 contentHidden=true로 본문을 비워서 내려보내고, 사용자가 "눌러서 보기"를
  // 누를 때 /api/reviews/[id]/content에서 불러온다(작성자 본인·"스포일러 항상 보기"는 그대로 보낸다).
  content: string;
  hasSpoiler: boolean;
  contentHidden: boolean;
  spoilerReportedByMe: boolean;
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
  userId: string | null,
  options: { alwaysShowSpoilers?: boolean } = {}
): Promise<ReviewWithAuthor[]> {
  const rows = await db.review.findMany({
    where: { movieCd, category, type },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { nickname: true, name: true, totalLikes: true } },
      likes: userId ? { where: { userId }, select: { type: true } } : false,
      spoilerReports: userId ? { where: { userId }, select: { id: true } } : false,
    },
  });
  return rows.map((r) => {
    const contentHidden =
      r.hasSpoiler && r.content.trim().length > 0 && r.userId !== userId && !options.alwaysShowSpoilers;
    return {
    id: r.id,
    rating: r.rating,
    content: contentHidden ? "" : r.content,
    hasSpoiler: r.hasSpoiler,
    contentHidden,
    spoilerReportedByMe: (r.spoilerReports?.length ?? 0) > 0,
    authorId: r.userId,
    authorName: r.user.nickname ?? r.user.name ?? "사용자",
    authorTier: getBadge(r.user.totalLikes),
    createdAt: r.createdAt.toISOString(),
    likeCount: r.likeCount,
    dislikeCount: r.dislikeCount,
    myVote: r.likes?.[0]?.type ?? null,
    };
  });
}

// 홈 화면 영화 카드 평균 평점 — 여러 영화의 SHORT/LONG "전체" 평점 평균을 한 번에 조회.
export async function getBulkMovieRatingAverages(
  movieCds: string[]
): Promise<Map<string, { shortAvg: number | null; longAvg: number | null; shortCount: number }>> {
  if (movieCds.length === 0) return new Map();
  const rows = await db.review.groupBy({
    by: ["movieCd", "type"],
    where: { movieCd: { in: movieCds }, category: "전체" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const result = new Map<string, { shortAvg: number | null; longAvg: number | null; shortCount: number }>();
  for (const row of rows) {
    const entry = result.get(row.movieCd) ?? { shortAvg: null, longAvg: null, shortCount: 0 };
    if (row.type === "SHORT") {
      entry.shortAvg = row._avg.rating ?? null;
      entry.shortCount = row._count._all; // 한줄평(평점만 남긴 것 포함)을 남긴 사람 수 — 1인 1개
    } else if (row.type === "LONG") entry.longAvg = row._avg.rating ?? null;
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
      select: { content: true, likeCount: true, hasSpoiler: true },
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
    // 프로필 미리보기엔 스포일러 본문을 싣지 않는다.
    topLikedContent: topLiked ? (topLiked.hasSpoiler && topLiked.content.trim() ? SPOILER_PLACEHOLDER : topLiked.content) : null,
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

// 리뷰 목록에 붙일 제목 — 그 목록에 나오는 작품만 읽는다(예전엔 저장된 영화 제목 전체를
// 매번 읽었다). 시리즈(tmdb-tv-*)는 CachedSeries에서 찾는다.
export async function getTitleMap(movieCds: string[]): Promise<Map<string, string>> {
  const cds = [...new Set(movieCds)];
  const seriesIds = cds.filter((cd) => cd.startsWith("tmdb-tv-")).map((cd) => cd.slice("tmdb-tv-".length));
  const [movies, series] = await Promise.all([
    cds.length > 0 ? db.cachedMovie.findMany({ where: { movieCd: { in: cds } }, select: { movieCd: true, title: true } }) : [],
    seriesIds.length > 0 ? db.cachedSeries.findMany({ where: { tmdbId: { in: seriesIds } }, select: { tmdbId: true, name: true } }) : [],
  ]);
  return new Map([
    ...movies.map((m) => [m.movieCd, m.title] as const),
    ...series.map((s) => [`tmdb-tv-${s.tmdbId}`, s.name] as const),
  ]);
}

// viewerId가 작성자 본인이 아니면 스포일러 리뷰 본문은 "스포일러가 포함된 한줄평" 문구로 바꿔 보낸다.
export async function getReviewsByUser(userId: string, viewerId: string | null = null): Promise<UserReview[]> {
  const rows = await db.review.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  const titleMap = await getTitleMap(rows.map((r) => r.movieCd));
  return rows.map((r) => ({
    id: r.id,
    movieCd: r.movieCd,
    movieTitle: titleMap.get(r.movieCd) ?? r.movieCd,
    category: r.category,
    type: r.type as "SHORT" | "LONG",
    rating: r.rating,
    content: r.hasSpoiler && r.content.trim() && viewerId !== userId ? SPOILER_PLACEHOLDER : r.content,
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

export type MyReview = { rating: number; content: string; createdAt: string; isSpoiler: boolean } | null;

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
  return row
    ? { rating: row.rating, content: row.content, createdAt: row.createdAt.toISOString(), isSpoiler: row.hasSpoiler }
    : null;
}
