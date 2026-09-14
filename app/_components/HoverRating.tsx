"use client";

import { useSyncExternalStore } from "react";
import { subscribe, getAverageRating, getSeedAverageRating } from "../_lib/reviews-store";

// myRating(내 평점)이 있으면 그것을 우선 표시하고, 없으면 플랫폼 평균을 표시한다.
// 리뷰가 전혀 없으면 아무것도 렌더링하지 않는다.
export default function HoverRating({ movieId, myRating }: { movieId: string; myRating?: number | null }) {
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

  // 내 평점이 있으면 항상 내 평점을 보여준다.
  if (myRating != null) {
    return (
      <div className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-star/30 px-2 py-0.5 text-[11px] font-bold text-star ring-1 ring-inset ring-star/50">
        ★ {myRating.toFixed(1)}
      </div>
    );
  }

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
    <div className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-star">
      ★ {combined.toFixed(1)}
    </div>
  );
}
