"use client";

import type { UserReview } from "../_lib/review-data";

export default function UserReviewsPanel({
  reviews,
  userName,
  side = "right",
}: {
  reviews: UserReview[];
  userName: string;
  side?: "right" | "left";
}) {
  const shown = reviews
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 3);

  if (shown.length === 0) return null;

  return (
    <div
      className={`absolute top-0 z-20 w-44 rounded-lg border border-neutral-700 bg-surface p-3 shadow-xl sm:w-52 ${
        side === "right" ? "left-full ml-2" : "right-full mr-2"
      }`}
    >
      <p className="text-xs font-semibold text-text">{userName}님이 남긴 평론</p>
      <ul className="mt-2 space-y-2">
        {shown.map((review) => (
          <li key={review.id}>
            <span className="text-[10px] text-muted">
              {review.category} · {review.type === "SHORT" ? "한줄평" : "장문평"}
            </span>
            <div className="text-[11px] font-bold text-star">★ {review.rating.toFixed(1)}</div>
            <p className="mt-0.5 line-clamp-3 text-[11px] text-text">{review.content}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
