"use client";

import { useState, useSyncExternalStore } from "react";
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
import { containsSpoilerKeyword } from "../_lib/spoiler";

// 그 영화의 한줄평 중 좋아요를 가장 많이 받은 것을 미리보기로 보여준다.
export default function TopLikedReview({ movieId }: { movieId: string }) {
  const [revealed, setRevealed] = useState(false);
  const reviews = useSyncExternalStore(
    subscribe,
    () => getReviewsSnapshot(movieId, "short"),
    () => getSeedReviewsSnapshot(movieId, "short")
  );
  const votesState = useSyncExternalStore(subscribeVotes, getVotesSnapshot, getServerVotesSnapshot);

  // 텍스트가 있는 한줄평 중 좋아요 1위 — 없으면 평점만 남긴 리뷰도 표시
  const ranked = [...reviews]
    .map((review) => ({ review, likes: getReviewVote(votesState, review.id).likes }))
    .sort((a, b) => b.likes - a.likes);

  const topWithText = ranked.find((r) => r.review.content.trim().length > 0);
  const top = topWithText ?? ranked[0];
  if (!top) return null;

  const hasText = top.review.content.trim().length > 0;
  const isSpoiler = hasText && containsSpoilerKeyword(top.review.content);

  if (isSpoiler && !revealed) {
    return (
      <button type="button" onClick={() => setRevealed(true)} className="block w-full text-left">
        <p className="line-clamp-2 select-none text-[11px] text-muted blur-sm">
          👍 {top.likes} "{top.review.content}"
        </p>
        <span className="text-[10px] font-semibold text-brand">스포일러 포함 · 클릭해서 보기</span>
      </button>
    );
  }

  if (!hasText) {
    return (
      <p className="text-[11px] text-muted">
        👍 {top.likes} ★ {top.review.rating.toFixed(1)} <span className="text-muted/60">(평점만 남김)</span>
      </p>
    );
  }

  return (
    <p className="line-clamp-2 text-[11px] text-muted">
      👍 {top.likes} "{top.review.content}"
    </p>
  );
}
