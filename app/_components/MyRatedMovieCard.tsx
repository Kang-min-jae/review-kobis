"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import StarRating from "./StarRating";
import MyReviewsPanel from "./MyReviewsPanel";
import type { MyMovieRating } from "../_lib/reviews-store";
import type { FestivalAward } from "../_lib/movie-rows";

const FESTIVAL_KO: Record<string, string> = {
  academy: "아카데미상",
  cannes: "칸 영화제",
  berlin: "베를린 영화제",
  venice: "베니스 영화제",
};

// 마우스를 올리면(데스크톱) 내가 그 영화에 남긴 리뷰가 옆에 뜬다. 탭/클릭은
// 예매·평점 버튼 같은 경쟁 요소가 안에 없어서 그냥 바로 평가 페이지로 이동해도 된다 —
// MovieCard처럼 탭을 한 번 더 가로챌 필요가 없다.
export default function MyRatedMovieCard({ movie, festivalAwards }: { movie: MyMovieRating; festivalAwards?: FestivalAward[] }) {
  const [revealed, setRevealed] = useState(false);
  const [awardTooltip, setAwardTooltip] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const hasAward = festivalAwards && festivalAwards.length > 0;
  const rateHref = movie.id.startsWith("tmdb-tv-") ? `/series/${movie.id}/rate` : `/movies/${movie.id}/rate`;

  const groupedAwards = useMemo(() => {
    if (!festivalAwards) return [];
    const map = new Map<string, { festival: string; year: number; categories: string[] }>();
    for (const a of festivalAwards) {
      const key = `${a.festival}|${a.year}`;
      const entry = map.get(key) ?? { festival: a.festival, year: a.year, categories: [] };
      if (a.categoryLabel && !entry.categories.includes(a.categoryLabel)) entry.categories.push(a.categoryLabel);
      map.set(key, entry);
    }
    return Array.from(map.values());
  }, [festivalAwards]);

  return (
    <div
      className="relative w-32 shrink-0"
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
    >
      <Link
        href={rateHref}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className={`relative block aspect-2/3 overflow-hidden rounded-lg ${
          movie.posterUrl && !posterFailed ? "bg-surface" : `bg-gradient-to-br ${movie.gradient}`
        }`}
      >
        {movie.posterUrl && !posterFailed && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} onError={() => setPosterFailed(true)} />}
        {hasAward && groupedAwards.length > 0 && (
          <button
            type="button"
            aria-label={festivalAwards!.map((a) => `${FESTIVAL_KO[a.festival] ?? a.festival} ${a.categoryLabel} (${a.year})`).join(", ")}
            className="absolute right-1.5 top-1.5 flex cursor-pointer flex-col items-end gap-0.5"
            onMouseEnter={() => setAwardTooltip(true)}
            onMouseLeave={() => setAwardTooltip(false)}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAwardTooltip((v) => !v); }}
          >
            {groupedAwards.map((_, i) => (
              <span key={i} className="rounded-full bg-yellow-500/30 px-1.5 py-0.5 text-[11px] leading-none ring-1 ring-inset ring-yellow-400/50">
                🏆
              </span>
            ))}
          </button>
        )}
      </Link>
      <p className="mt-2 line-clamp-2 text-xs font-medium text-text">{movie.title}</p>
      <div className="mt-1">
        <StarRating rating={movie.rating} scale={10} size="h-3 w-3" />
      </div>

      {awardTooltip && groupedAwards.length > 0 && (
        <div
          className="absolute right-0 top-1 z-50 max-w-[200px] rounded-lg bg-black/90 p-2 text-[11px] text-white ring-1 ring-white/10"
          onMouseEnter={() => setAwardTooltip(true)}
          onMouseLeave={() => setAwardTooltip(false)}
        >
          {groupedAwards.map((g, i) => (
            <div key={i} className="py-0.5 leading-snug">
              <span className="font-semibold">{FESTIVAL_KO[g.festival] ?? g.festival}</span>{" "}
              <span className="text-white/60">{g.year}</span>
              {g.categories.length > 0 && (
                <> · <span className="text-yellow-300">{g.categories.join(", ")}</span></>
              )}
            </div>
          ))}
        </div>
      )}

      {revealed && <MyReviewsPanel movieId={movie.id} />}
    </div>
  );
}
