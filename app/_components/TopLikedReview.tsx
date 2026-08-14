"use client";

import { useSyncExternalStore } from "react";
import {
  subscribe,
  getReviewsSnapshot,
  getSeedReviewsSnapshot,
} from "../_lib/reviews-store";
import {
  subscribe as subscribeVotes,
  getVotesSnapshot,
  getServerVotesSnapshot,
  getReviewVote,
} from "../_lib/review-votes-store";

// 그 영화의 한줄평 중 좋아요를 가장 많이 받은 것을 미리보기로 보여준다.
export default function TopLikedReview({ movieId }: { movieId: string }) {
  const reviews = useSyncExternalStore(
    subscribe,
    () => getReviewsSnapshot(movieId, "short"),
    () => getSeedReviewsSnapshot(movieId, "short")
  );
  const votesState = useSyncExternalStore(subscribeVotes, getVotesSnapshot, getServerVotesSnapshot);

  if (reviews.length === 0) return null;

  const [top] = [...reviews]
    .map((review) => ({ review, likes: getReviewVote(votesState, review.id).likes }))
    .sort((a, b) => b.likes - a.likes);

  return (
    <p className="line-clamp-2 text-[11px] text-muted">
      👍 {top.likes} “{top.review.content}”
    </p>
  );
}
