"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  subscribe,
  getReviewsSnapshot,
  getSeedReviewsSnapshot,
  getCombinedRatingSnapshot,
  getMyReviewsSnapshot,
  getServerMyReviewsSnapshot,
} from "../_lib/reviews-store";
import {
  subscribe as subscribeVotes,
  getVotesSnapshot,
  getServerVotesSnapshot,
  getReviewVote,
} from "../_lib/review-votes-store";

const MAX_OTHERS = 2;

// 카드를 펼쳤을 때(hover/탭) 포스터 옆에 뜨는 패널 — 내 평점(있으면)과, 좋아요를
// 가장 많이 받은 다른 사람 한줄평 최대 2개를 보여준다.
export default function TopReviewsPanel({ movieId }: { movieId: string }) {
  const reviews = useSyncExternalStore(
    subscribe,
    () => getReviewsSnapshot(movieId, "short"),
    () => getSeedReviewsSnapshot(movieId, "short")
  );
  const myReviews = useSyncExternalStore(subscribe, getMyReviewsSnapshot, getServerMyReviewsSnapshot);
  const votesState = useSyncExternalStore(subscribeVotes, getVotesSnapshot, getServerVotesSnapshot);
  const { average, count } = getCombinedRatingSnapshot(movieId);

  // 내가 이 영화에 남긴 "전체" 한줄평
  const myReview = useMemo(
    () => myReviews.find((r) => r.movieId === movieId && r.type === "short" && (r.category ?? "전체") === "전체") ?? null,
    [myReviews, movieId]
  );

  // 내 리뷰 제외한 나머지를 좋아요 순으로 정렬
  const topOthers = useMemo(
    () =>
      [...reviews]
        .filter((r) => !myReview || r.id !== myReview.id)
        .map((review) => ({ review, likes: getReviewVote(votesState, review.id).likes }))
        .sort((a, b) => b.likes - a.likes)
        .slice(0, MAX_OTHERS),
    [reviews, myReview, votesState]
  );

  return (
    <div className="absolute left-full top-0 z-20 ml-2 w-44 rounded-lg border border-neutral-700 bg-surface p-3 shadow-xl sm:w-52">
      <p className="text-xs font-semibold text-text">
        평점 <span className="text-star">{average !== null ? (average * 10).toFixed(1) : "-"}</span>
        {count > 0 && <span className="text-muted"> ({count}명)</span>}
      </p>

      {myReview && (
        <div className="mt-2 rounded bg-star/10 px-2 py-1.5 ring-1 ring-inset ring-star/30">
          <p className="text-[10px] font-semibold text-star">내 평점</p>
          <span className="text-[11px] font-bold text-star">★ {myReview.rating.toFixed(1)}</span>
          {myReview.content && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-text">{myReview.content}</p>
          )}
          {!myReview.content && (
            <p className="mt-0.5 text-[10px] text-muted">한줄평 없음</p>
          )}
        </div>
      )}

      {topOthers.length === 0 && !myReview ? (
        <p className="mt-2 text-[11px] text-muted">아직 등록된 한줄평이 없어요.</p>
      ) : topOthers.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {topOthers.map(({ review }) => (
            <li key={review.id}>
              <span className="text-[11px] font-bold text-star">★ {review.rating.toFixed(1)}</span>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-text">{review.content}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
