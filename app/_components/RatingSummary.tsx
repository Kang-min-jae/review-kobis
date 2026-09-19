"use client";

import { useSyncExternalStore } from "react";
import { subscribe, getAverageRating, getSeedAverageRating } from "../_lib/reviews-store";

function RatingRow({
  label,
  rating,
  scale,
}: {
  label: string;
  rating: number | null;
  scale: number;
}) {
  if (rating === null) return null;
  const display = (rating / scale * 10).toFixed(1);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-[10px] text-muted">{label}</span>
      <span className="truncate text-[10px] font-bold text-star">★ {display}</span>
    </div>
  );
}

export default function RatingSummary({
  movieId,
  shortAvg,
  longAvg,
}: {
  movieId: string;
  shortAvg?: number | null;
  longAvg?: number | null;
}) {
  const shortFromStore = useSyncExternalStore(
    subscribe,
    () => getAverageRating(movieId, "short"),
    () => getSeedAverageRating(movieId, "short")
  );
  const longFromStore = useSyncExternalStore(
    subscribe,
    () => getAverageRating(movieId, "long"),
    () => getSeedAverageRating(movieId, "long")
  );

  // 서버 집계 평균 우선, 없으면 localStorage 기반 값 사용
  const shortRating = shortAvg ?? shortFromStore;
  const longRating = longAvg ?? longFromStore;

  return (
    <div className="space-y-1">
      <RatingRow label="한줄평" rating={shortRating} scale={10} />
      <RatingRow label="장문평" rating={longRating} scale={100} />
    </div>
  );
}
