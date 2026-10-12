"use client";

import { useState } from "react";
import PosterImage from "./PosterImage";

export default function PosterWithFallback({
  posterUrl,
  gradient,
  movieTitle,
  sizeClassName = "w-28 sm:w-28",
}: {
  posterUrl: string | null;
  gradient: string;
  movieTitle: string;
  sizeClassName?: string; // 포스터 너비(기본 w-28)
}) {
  const [failed, setFailed] = useState(false);
  const showPoster = posterUrl && !failed;

  return (
    <div
      className={`relative aspect-2/3 shrink-0 overflow-hidden rounded-lg ${sizeClassName} ${
        showPoster ? "bg-surface" : `bg-gradient-to-br ${gradient}`
      }`}
    >
      {showPoster ? (
        <PosterImage src={posterUrl} alt={`${movieTitle} 포스터`} onError={() => setFailed(true)} />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2">
          <span className="text-2xl opacity-60">🎬</span>
          <p className="line-clamp-3 text-center text-[10px] leading-snug text-white/60">{movieTitle}</p>
        </div>
      )}
    </div>
  );
}
