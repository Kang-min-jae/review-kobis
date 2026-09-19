"use client";

import { useState, useMemo } from "react";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import StarRating from "./StarRating";
import type { MyRatedMovie } from "../_lib/my-rated-movies";
import {
  subscribe as subscribeReviews,
  getMyReviewsSnapshot,
  getServerMyReviewsSnapshot,
} from "../_lib/reviews-store";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function RatedMovieSearch({ movies }: { movies: MyRatedMovie[] }) {
  const [query, setQuery] = useState("");
  const myReviews = useSyncExternalStore(subscribeReviews, getMyReviewsSnapshot, getServerMyReviewsSnapshot);

  // movieId → 한줄평(전체, SHORT) 맵
  const reviewMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of myReviews) {
      if (r.type === "short" && (r.category ?? "전체") === "전체" && r.content.trim()) {
        if (!map.has(r.movieId)) map.set(r.movieId, r.content.trim());
      }
    }
    return map;
  }, [myReviews]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return movies.filter((m) => m.title.toLowerCase().includes(q)).slice(0, 10);
  }, [query, movies]);

  return (
    <div className="mt-6">
      <p className="mb-2 text-xs text-muted">내가 평점을 남긴 영화 검색</p>
      <div className="relative">
        <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
        <input
          type="text"
          placeholder="영화 제목으로 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-neutral-700 bg-surface py-2.5 pl-9 pr-9 text-sm text-text placeholder-neutral-500 focus:border-brand focus:outline-none"
        />
        {query && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500 hover:text-text"
          >
            ✕
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div className="mt-1 overflow-hidden rounded-lg border border-neutral-700 bg-surface">
          {results.map((movie) => {
            const href = movie.id.startsWith("tmdb-tv-")
              ? `/series/${movie.id}/rate`
              : `/movies/${movie.id}/rate`;
            const reviewContent = reviewMap.get(movie.id);
            return (
              <Link
                key={movie.id}
                href={href}
                className="flex items-center gap-3 border-b border-neutral-800 p-3 transition-colors last:border-b-0 hover:bg-black/30"
              >
                <div
                  className={`relative h-12 w-9 shrink-0 overflow-hidden rounded ${
                    movie.posterUrl ? "bg-black" : `bg-gradient-to-br ${movie.gradient}`
                  }`}
                >
                  {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{movie.title}</p>
                  {reviewContent ? (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{reviewContent}</p>
                  ) : (
                    <p className="text-[11px] text-muted">내 평점</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-muted">{formatDate(movie.ratedAt)}</p>
                  <div className="mt-0.5">
                    <StarRating rating={movie.rating} scale={10} size="h-3 w-3" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {query.trim() && results.length === 0 && (
        <p className="mt-2 text-xs text-muted">검색 결과가 없어요.</p>
      )}
    </div>
  );
}
