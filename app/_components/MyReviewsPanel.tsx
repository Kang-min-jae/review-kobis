"use client";

import { useSyncExternalStore } from "react";
import { subscribe, getMyReviewsSnapshot, getServerMyReviewsSnapshot } from "../_lib/reviews-store";

const MAX_REVIEWS = 3;

// 나만의 영화 리스트에서 카드에 마우스를 올렸을 때, 내가 그 영화에 남긴 리뷰를
// 옆에 보여주는 패널. TopReviewsPanel과 달리 좋아요 순이 아니라 최근 순이고,
// "다른 사람들의 인기 리뷰"가 아니라 "내가 쓴 리뷰"만 보여준다.
export default function MyReviewsPanel({ movieId, side = "right" }: { movieId: string; side?: "right" | "left" }) {
  const reviews = useSyncExternalStore(subscribe, getMyReviewsSnapshot, getServerMyReviewsSnapshot);

  const mine = reviews
    .filter((review) => review.movieId === movieId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, MAX_REVIEWS);

  if (mine.length === 0) return null;

  return (
    <div className={`absolute top-0 z-20 w-44 rounded-lg border border-neutral-700 bg-surface p-3 shadow-xl sm:w-52 ${side === "right" ? "left-full ml-2" : "right-full mr-2"}`}>
      <p className="text-xs font-semibold text-text">내가 남긴 평론</p>
      <ul className="mt-2 space-y-2">
        {mine.map((review) => (
          <li key={review.id}>
            <span className="text-[10px] text-muted">
              {review.category} · {review.type === "short" ? "한줄평" : "장문평"}
            </span>
            <div className="text-[11px] font-bold text-star">★ {review.rating.toFixed(1)}</div>
            <p className="mt-0.5 line-clamp-3 text-[11px] text-text">{review.content}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
