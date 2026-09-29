"use client";

import { useSyncExternalStore } from "react";
import { subscribe, getMyReviewsSnapshot, getServerMyReviewsSnapshot } from "../_lib/reviews-store";
import {
  subscribe as subscribeVotes,
  getVotesSnapshot,
  getServerVotesSnapshot,
  getReviewVote,
} from "../_lib/review-votes-store";

// 지금 가진 데이터(내가 남긴 리뷰 + 좋아요)만으로 정직하게 계산할 수 있는 것만
// 보여준다 — 장르 취향이나 "다른 사람 평균과 비교" 같은 건 실제 장르/커뮤니티
// 데이터가 없어서 지어낼 수 없으니 넣지 않는다.
export default function MyStyleReport() {
  const reviews = useSyncExternalStore(subscribe, getMyReviewsSnapshot, getServerMyReviewsSnapshot);
  const votesState = useSyncExternalStore(subscribeVotes, getVotesSnapshot, getServerVotesSnapshot);

  if (reviews.length === 0) return null;

  const movieCount = new Set(reviews.map((r) => r.movieId)).size;
  const shortReviews = reviews.filter((r) => r.type === "short");
  const longReviews = reviews.filter((r) => r.type === "long");

  // 한줄평 평균: 0~10 척도 그대로, 장문평 평균: 0~100을 10으로 환산
  const shortAvg = shortReviews.length > 0
    ? shortReviews.reduce((sum, r) => sum + r.rating, 0) / shortReviews.length
    : null;
  const longAvg = longReviews.length > 0
    ? longReviews.reduce((sum, r) => sum + r.rating, 0) / longReviews.length
    : null;

  const [topLiked] = [...reviews]
    .map((review) => ({ review, likes: getReviewVote(votesState, review.id).likes }))
    .sort((a, b) => b.likes - a.likes);

  return (
    <div className="rounded-lg border border-neutral-700 bg-surface p-4">
      <h2 className="text-sm font-bold text-text">평론 스타일 분석 리포트</h2>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-black/30 p-3 text-center">
          <p className="text-lg font-bold text-brand">{movieCount}</p>
          <p className="mt-0.5 text-[11px] text-muted">평가한 작품</p>
        </div>
        <div className="rounded-lg bg-black/30 p-3 text-center">
          <p className="text-lg font-bold text-brand">{reviews.length}</p>
          <p className="mt-0.5 text-[11px] text-muted">남긴 리뷰</p>
        </div>
        <div className="rounded-lg bg-black/30 p-3 text-center">
          <p className="text-lg font-bold text-star">
            {shortAvg !== null ? shortAvg.toFixed(1) : "—"}
            <span className="mx-1 text-muted">/</span>
            {longAvg !== null ? longAvg.toFixed(1) : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">한줄평(10) / 장문평(100) 평균</p>
        </div>
        <div className="rounded-lg bg-black/30 p-3 text-center">
          <p className="text-lg font-bold text-text">
            {shortReviews.length} / {longReviews.length}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">한줄평 / 장문평</p>
        </div>
      </div>

      {topLiked && topLiked.likes > 0 && (
        <div className="mt-4 border-t border-neutral-700 pt-3">
          <p className="text-[11px] text-muted">가장 많은 좋아요를 받은 내 평론</p>
          <p className="mt-1 line-clamp-2 text-sm text-text">&ldquo;{topLiked.review.content}&rdquo;</p>
          <p className="mt-1 text-[11px] font-semibold text-star">👍 {topLiked.likes}</p>
        </div>
      )}
    </div>
  );
}
