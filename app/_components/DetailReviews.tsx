// 작품 상세(영화·시리즈) 페이지의 리뷰 영역 — 별점·한줄평 입력과 리뷰 목록, 별점 분포(서버 컴포넌트).
// 제목·포스터·줄거리 같은 본문은 페이지가 먼저 그리고, 사람마다 다르고 느린 이 부분만 <Suspense>로 늦게 불러온다.

import type { Session } from "next-auth";
import CategoryRateForm from "./CategoryRateForm";
import RatingDistribution from "./RatingDistribution";
import { getMyReview, getReviewsForCategoryType } from "../_lib/review-data";
import type { RatingCategory } from "../_lib/category-ratings-store";
import { db } from "../_lib/db";

// 리뷰 영역(별점·한줄평 입력과 리뷰 목록)을 불러오는 동안의 뼈대 — 입력 칸 + 리뷰 카드 3개 자리.
export function ReviewsSkeleton() {
  return (
    <div aria-busy="true" aria-label="리뷰를 불러오는 중">
      <div className="h-14 animate-pulse rounded-xl bg-neutral-800" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-neutral-800" />
        ))}
      </div>
    </div>
  );
}

export function RatingDistributionSkeleton() {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-surface p-4" aria-busy="true">
      <h2 className="text-sm font-bold text-text">별점 분포</h2>
      <div className="mt-3 space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-2 animate-pulse rounded-full bg-black/40" />
        ))}
      </div>
    </section>
  );
}

export type ReviewData = {
  session: Session | null;
  shortReviews: Awaited<ReturnType<typeof getReviewsForCategoryType>>;
  longReviews: Awaited<ReturnType<typeof getReviewsForCategoryType>>;
  myShortReview: Awaited<ReturnType<typeof getMyReview>>;
  myLongReview: Awaited<ReturnType<typeof getMyReview>>;
  alwaysShowSpoilers: boolean;
  followingIds: string[];
};

// 로그인 정보·리뷰 목록·내 리뷰·팔로잉 — 리뷰 영역과 별점 분포가 같이 쓰므로 한 번만 불러 나눠 준다.
export async function loadReviewData(movieCd: string, category: RatingCategory, sessionPromise: Promise<Session | null>): Promise<ReviewData> {
  const session = await sessionPromise;
  const userId = session?.user?.id ?? null;
  // "스포일러 항상 보기" 설정에 따라 스포일러 리뷰 본문을 처음부터 보낼지가 달라져 먼저 읽는다.
  const prefs = userId
    ? await db.user.findUnique({ where: { id: userId }, select: { alwaysShowSpoilers: true } }).catch(() => null)
    : null;
  const alwaysShowSpoilers = prefs?.alwaysShowSpoilers ?? false;
  const [shortReviews, longReviews, myShortReview, myLongReview, following] = await Promise.all([
    getReviewsForCategoryType(movieCd, category, "SHORT", userId, { alwaysShowSpoilers }),
    getReviewsForCategoryType(movieCd, category, "LONG", userId, { alwaysShowSpoilers }),
    getMyReview(userId, movieCd, category, "SHORT"),
    getMyReview(userId, movieCd, category, "LONG"),
    userId
      ? db.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }).catch(() => [])
      : Promise.resolve([]),
  ]);
  return {
    session,
    shortReviews,
    longReviews,
    myShortReview,
    myLongReview,
    alwaysShowSpoilers,
    followingIds: following.map((f) => f.followingId),
  };
}

// 리뷰 영역에 필요한 작품 정보(영화·시리즈 공통).
export type ReviewTarget = { movieId: string; movieCd: string; title: string; posterUrl: string | null; gradient: string };

export async function ReviewsSection({
  dataPromise,
  movie,
  category,
}: {
  dataPromise: Promise<ReviewData>;
  movie: ReviewTarget;
  category: RatingCategory;
}) {
  const data = await dataPromise;
  const userId = data.session?.user?.id ?? null;
  return (
    <CategoryRateForm
      movieId={movie.movieId}
      movieCd={movie.movieCd}
      movieTitle={movie.title}
      moviePosterUrl={movie.posterUrl}
      movieGradient={movie.gradient}
      category={category}
      isLoggedIn={Boolean(userId)}
      userId={userId}
      userName={data.session?.user?.name ?? null}
      isAdmin={data.session?.user?.role === "ADMIN"}
      reviews={{ SHORT: data.shortReviews, LONG: data.longReviews }}
      myReviews={{ SHORT: data.myShortReview, LONG: data.myLongReview }}
      followingIds={data.followingIds}
      alwaysShowSpoilers={data.alwaysShowSpoilers}
    />
  );
}

export async function RatingDistributionData({ dataPromise }: { dataPromise: Promise<ReviewData> }) {
  const { shortReviews } = await dataPromise;
  return <RatingDistribution ratings={shortReviews.map((r) => r.rating)} />;
}
