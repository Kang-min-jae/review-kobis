"use client";

import { useSyncExternalStore } from "react";
import {
  subscribe,
  getReviewsSnapshot,
  getSeedReviewsSnapshot,
  getCombinedRatingSnapshot,
} from "../_lib/reviews-store";
import {
  subscribe as subscribeVotes,
  getVotesSnapshot,
  getServerVotesSnapshot,
  getReviewVote,
} from "../_lib/review-votes-store";

const MAX_REVIEWS = 2;

// 카드를 펼쳤을 때(hover/탭) 포스터 옆에 뜨는 패널 — 전체 평점과, 좋아요를 가장
// 많이 받은 한줄평 최대 2개를 보여준다.
export default function TopReviewsPanel({ movieId }: { movieId: string }) {
  const reviews = useSyncExternalStore(
    subscribe,
    () => getReviewsSnapshot(movieId, "short"),
    () => getSeedReviewsSnapshot(movieId, "short")
  );
  const votesState = useSyncExternalStore(subscribeVotes, getVotesSnapshot, getServerVotesSnapshot);
  const { average, count } = getCombinedRatingSnapshot(movieId);

  const topReviews = [...reviews]
    .map((review) => ({ review, likes: getReviewVote(votesState, review.id).likes }))
    .sort((a, b) => b.likes - a.likes)
    .slice(0, MAX_REVIEWS);

  return (
    <div className="absolute left-full top-0 z-20 ml-2 w-44 rounded-lg border border-neutral-700 bg-surface p-3 shadow-xl sm:w-52">
      <p className="text-xs font-semibold text-text">
        평점 <span className="text-star">{average !== null ? (average * 10).toFixed(1) : "-"}</span>
        {count > 0 && <span className="text-muted"> ({count}명)</span>}
      </p>

      {topReviews.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted">아직 등록된 한줄평이 없어요.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {topReviews.map(({ review }) => (
            <li key={review.id}>
              <span className="text-[11px] font-bold text-star">★ {review.rating.toFixed(1)}</span>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-text">{review.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
