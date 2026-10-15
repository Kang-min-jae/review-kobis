"use client";

import { topReviewsVersion, useTopReviews } from "../_lib/use-top-reviews";
import TopReviewsList from "./TopReviewsList";
import { movieIdToCd } from "../_lib/rating-input";

// 카드를 펼쳤을 때(hover/탭) 포스터 옆에 뜨는 패널.
// 집계 평점 + 서버 기반 상위 한줄평 2개를 보여준다.
// BoxOfficeCoverflow 뒤집기 카드와 동일한 useTopReviews/TopReviewsList를 사용한다.
// 카드 ID → 리뷰 DB의 movieCd (kobis-20241234 → "20241234", tmdb-*·tmdb-tv-*·kmdb-*는 그대로,
// wikidata-Q123-작품상 → "wikidata-Q123"). 예전엔 KOBIS·시리즈만 처리해서 TMDB 영화·수상작
// 카드에서는 인기 한줄평이 항상 비어 있었다.
const toApiMovieCd = movieIdToCd;

export default function TopReviewsPanel({
  movieId,
  shortCount = null,
  shortAvg = null,
  side = "right",
  myRating = null,
}: {
  movieId: string;
  shortCount?: number | null; // 카드의 최신 한줄평 수·평균 — 바뀌면 목록을 새로 받는다
  shortAvg?: number | null;
  side?: "left" | "right";
  myRating?: number | null; // 내가 남긴 "전체" 한줄평 평점(0~10)
}) {
  const movieCd = toApiMovieCd(movieId);
  const { reviews, loading } = useTopReviews(movieCd, topReviewsVersion({ shortCount, shortAvg }));

  return (
    <div className={`absolute top-0 z-20 w-44 rounded-lg border border-neutral-700 bg-surface p-3 shadow-xl sm:w-52 ${side === "left" ? "right-full mr-2" : "left-full ml-2"}`}>
      <p className="text-xs font-semibold text-text">
        내 평점 <span className="text-star">{myRating !== null ? myRating.toFixed(1) : "-"}</span>
      </p>
      <TopReviewsList reviews={reviews} loading={loading} />
    </div>
  );
}
