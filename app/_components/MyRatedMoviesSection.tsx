"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import StarRating from "./StarRating";
import type { MyRatedMovie } from "../_lib/my-rated-movies";

type SortKey = "latest" | "high" | "low";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "latest", label: "최신순" },
  { key: "high", label: "평점 높은순" },
  { key: "low", label: "낮은순" },
];

// 실제 계정으로 "전체 평점"을 남기면 자동으로 채워지는 칸 — 게스트 모드 리뷰(위쪽
// "내가 높게 평가한 영화"/"최근에 평가한 영화")와는 별개로, 로그인 계정의 평점만 모은다.
export default function MyRatedMoviesSection({ movies }: { movies: MyRatedMovie[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("latest");

  const sorted = useMemo(() => {
    const copy = [...movies];
    if (sortKey === "latest") copy.sort((a, b) => (a.ratedAt < b.ratedAt ? 1 : -1));
    else if (sortKey === "high") copy.sort((a, b) => b.rating - a.rating);
    else copy.sort((a, b) => a.rating - b.rating);
    return copy;
  }, [movies, sortKey]);

  if (movies.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-text">내가 평점 남긴 영화</h2>
        <div className="flex shrink-0 gap-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSortKey(opt.key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                sortKey === opt.key ? "bg-star text-black" : "bg-surface text-muted hover:text-text"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="row-scrollbar mt-3 flex gap-4 overflow-x-auto pb-3">
        {sorted.map((movie) => (
          <Link key={movie.id} href={`/movies/${movie.id}/rate`} className="w-32 shrink-0">
            <div
              className={`relative aspect-2/3 overflow-hidden rounded-lg ${
                movie.posterUrl ? "bg-surface" : `bg-gradient-to-br ${movie.gradient}`
              }`}
            >
              {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
              {movie.awardBadge && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-yellow-500/30 px-1.5 py-0.5 text-[11px] leading-none ring-1 ring-inset ring-yellow-400/50">
                  🏆
                </span>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-xs font-medium text-text">{movie.title}</p>
            <div className="mt-1">
              <StarRating rating={movie.rating} scale={10} size="h-3 w-3" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
