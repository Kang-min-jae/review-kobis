"use client";

import { useSyncExternalStore } from "react";
import StarRating from "./StarRating";
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
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-9 shrink-0 text-[10px] text-muted">{label}</span>
      <StarRating rating={rating} scale={scale} size="h-3 w-3" />
    </div>
  );
}

export default function RatingSummary({ movieId }: { movieId: string }) {
  const shortRating = useSyncExternalStore(
    subscribe,
    () => getAverageRating(movieId, "short"),
    () => getSeedAverageRating(movieId, "short")
  );
  const longRating = useSyncExternalStore(
    subscribe,
    () => getAverageRating(movieId, "long"),
    () => getSeedAverageRating(movieId, "long")
  );

  return (
    <div className="space-y-1">
      <RatingRow label="한줄평" rating={shortRating} scale={10} />
      <RatingRow label="장문평" rating={longRating} scale={100} />
    </div>
  );
}
