"use client";

import { useSyncExternalStore } from "react";
import { subscribe, getAverageRating, getSeedAverageRating } from "../_lib/reviews-store";

// 한줄평(0~10)과 장문평(0~100, 10으로 환산)의 평균을 포스터 위에 별과 함께 표시.
// 리뷰가 하나도 없으면 아무것도 렌더링하지 않는다.
export default function HoverRating({ movieId }: { movieId: string }) {
  const shortAvg = useSyncExternalStore(
    subscribe,
    () => getAverageRating(movieId, "short"),
    () => getSeedAverageRating(movieId, "short")
  );
  const longAvg = useSyncExternalStore(
    subscribe,
    () => getAverageRating(movieId, "long"),
    () => getSeedAverageRating(movieId, "long")
  );

  const longNormalized = longAvg === null ? null : longAvg / 10;
  const combined =
    shortAvg === null && longNormalized === null
      ? null
      : shortAvg === null
        ? longNormalized
        : longNormalized === null
          ? shortAvg
          : (shortAvg + longNormalized) / 2;

  if (combined === null) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <span className="flex items-center gap-1.5 text-2xl font-bold text-star">
        ★ {combined.toFixed(1)}
      </span>
    </div>
  );
}
