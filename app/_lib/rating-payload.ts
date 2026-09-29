// 추천(사용자 추천 영화·시리즈)과 추천도 배지(/api/affinity)가 공통으로 서버에 보내는 내 평점.
//
// 영화별 "전체" 평점은 한줄평 점수(0~10)를 우선하고, 없으면 장문평(0~100)을 0~10으로
// 환산한다 — 서버의 CategoryRating 동기화 규칙과 같다. 예전엔 항목 평점까지 섞어 가장 높은
// 값을 썼는데, 그러면 전체 3점을 준 영화도 음악에 9점을 주면 "좋아한 영화"로 잡혀 취향
// 계산이 틀어졌다. 전체 평점 없이 항목 평점만 남긴 영화는 항목 평균을 대신 쓴다(본 영화라
// 추천에서도 빠져야 하므로 목록엔 남긴다).

import { getMyReviewsSnapshot } from "./reviews-store";
import type { CategoryRatingInput, RatingInput } from "./rating-input";

export type RatingsPayload = {
  myRatings: RatingInput[];
  myCategoryRatings: CategoryRatingInput[];
};

const round1 = (value: number) => Math.round(value * 10) / 10;

export function buildRatingsPayload(): RatingsPayload {
  const movies = new Map<string, { short: number | null; long: number | null; ratedAt: string }>();
  // 항목 평점: 한줄평 점수(0~10) 우선, 장문평만 있으면 0~100을 0~10으로 환산
  const categories = new Map<string, CategoryRatingInput & { short: boolean }>();

  for (const review of getMyReviewsSnapshot()) {
    const isShort = review.type === "short";
    const value = isShort ? review.rating : review.rating / 10;
    if (!Number.isFinite(value)) continue;

    const movie = movies.get(review.movieId) ?? { short: null, long: null, ratedAt: review.createdAt };
    if (review.createdAt > movie.ratedAt) movie.ratedAt = review.createdAt;
    movies.set(review.movieId, movie);

    const category = review.category ?? "전체";
    if (category === "전체") {
      if (isShort) movie.short = value;
      else movie.long = value;
      continue;
    }
    const key = `${review.movieId}|${category}`;
    const prev = categories.get(key);
    if (prev?.short && !isShort) continue;
    categories.set(key, { movieId: review.movieId, category, value, short: isShort });
  }

  const categoryMean = new Map<string, { sum: number; count: number }>();
  for (const c of categories.values()) {
    const entry = categoryMean.get(c.movieId) ?? { sum: 0, count: 0 };
    entry.sum += c.value;
    entry.count += 1;
    categoryMean.set(c.movieId, entry);
  }

  const myRatings: RatingInput[] = [];
  for (const [movieId, movie] of movies) {
    const fallback = categoryMean.get(movieId);
    const rating = movie.short ?? movie.long ?? (fallback ? fallback.sum / fallback.count : null);
    if (rating === null) continue;
    myRatings.push({ movieId, rating: round1(rating), ratedAt: movie.ratedAt });
  }

  const myCategoryRatings = [...categories.values()].map(({ movieId, category, value }) => ({
    movieId,
    category,
    value: round1(value),
  }));
  return { myRatings, myCategoryRatings };
}

// 평점 조합이 바뀌었는지 비교하는 짧은 키 (내용 해시).
export function ratingsPayloadKey(payload: RatingsPayload): string {
  const text = JSON.stringify(payload);
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  return `${payload.myRatings.length}:${text.length}:${(hash >>> 0).toString(36)}`;
}
