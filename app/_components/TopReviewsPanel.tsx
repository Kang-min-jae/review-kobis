"use client";

import { getCombinedRatingSnapshot } from "../_lib/reviews-store";
import { useTopReviews } from "../_lib/use-top-reviews";
import TopReviewsList from "./TopReviewsList";

// 카드를 펼쳤을 때(hover/탭) 포스터 옆에 뜨는 패널.
// 집계 평점 + 서버 기반 상위 한줄평 2개를 보여준다.
// BoxOfficeCoverflow 뒤집기 카드와 동일한 useTopReviews/TopReviewsList를 사용한다.
// KOBIS: "kobis-20241234" → "20241234"
// 시리즈: "tmdb-tv-4613" → "tmdb-tv-4613" (review DB의 movieCd 키와 동일)
function toApiMovieCd(movieId: string): string | null {
  if (movieId.startsWith("kobis-")) return movieId.replace("kobis-", "");
  if (movieId.startsWith("tmdb-tv-")) return movieId;
  return null;
}

export default function TopReviewsPanel({ movieId }: { movieId: string }) {
  const { average, count } = getCombinedRatingSnapshot(movieId);
  const movieCd = toApiMovieCd(movieId);
  const { reviews, loading } = useTopReviews(movieCd);

  return (
    <div className="absolute left-full top-0 z-20 ml-2 w-44 rounded-lg border border-neutral-700 bg-surface p-3 shadow-xl sm:w-52">
      <p className="text-xs font-semibold text-text">
        평점 <span className="text-star">{average !== null ? (average * 10).toFixed(1) : "-"}</span>
        {count > 0 && <span className="text-muted"> ({count}명)</span>}
      </p>
      <TopReviewsList reviews={reviews} loading={loading} />
    </div>
  );
}
