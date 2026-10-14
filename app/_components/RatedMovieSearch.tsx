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

// 항목별 평점을 보여줄 순서 — "전체"는 결과 행 자체에 표시한다.
const CATEGORY_ORDER = ["연출", "연기", "각본", "음악", "편집"];

type CategoryEntry = { category: string; rating: number; content: string };

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

  // movieId → 항목별(연출·연기·각본·음악·편집) 내 평점. 같은 항목에 한줄평과 장문평이 둘 다
  // 있으면 한줄평 점수(0~10)를 쓰고, 장문평만 있으면 0~100을 0~10으로 환산한다.
  const categoryMap = useMemo(() => {
    const byMovie = new Map<string, Map<string, CategoryEntry>>();
    for (const r of myReviews) {
      const category = r.category ?? "전체";
      if (category === "전체") continue;
      const byCategory = byMovie.get(r.movieId) ?? new Map<string, CategoryEntry>();
      const prev = byCategory.get(category);
      if (!prev || r.type === "short") {
        byCategory.set(category, {
          category,
          rating: r.type === "short" ? r.rating : r.rating / 10,
          content: r.content.trim() || prev?.content || "",
        });
      }
      byMovie.set(r.movieId, byCategory);
    }
    return new Map(
      [...byMovie].map(([id, m]) => [
        id,
        [...m.values()].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)),
      ]),
    );
  }, [myReviews]);

  // "전체" 평점 없이 항목에만 평가한 영화도 검색되도록 후보에 넣는다.
  const { pool, categoryOnlyIds } = useMemo(() => {
    const known = new Set(movies.map((m) => m.id));
    const extra = new Map<string, MyRatedMovie>();
    for (const r of myReviews) {
      if (known.has(r.movieId) || extra.has(r.movieId)) continue;
      const entries = categoryMap.get(r.movieId);
      if (!entries || entries.length === 0) continue;
      extra.set(r.movieId, {
        id: r.movieId,
        title: r.movieTitle,
        posterUrl: r.moviePosterUrl,
        gradient: r.movieGradient,
        rating: entries.reduce((sum, e) => sum + e.rating, 0) / entries.length,
        ratedAt: r.createdAt,
      });
    }
    return { pool: [...movies, ...extra.values()], categoryOnlyIds: new Set(extra.keys()) };
  }, [movies, myReviews, categoryMap]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return pool.filter((m) => m.title.toLowerCase().includes(q)).slice(0, 10);
  }, [query, pool]);

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
            const base = movie.id.startsWith("tmdb-tv-") ? `/series/${movie.id}/rate` : `/movies/${movie.id}/rate`;
            const reviewContent = reviewMap.get(movie.id);
            const categoryEntries = categoryMap.get(movie.id) ?? [];
            const hasOverall = !categoryOnlyIds.has(movie.id);
            return (
              <div key={movie.id} className="border-b border-neutral-800 last:border-b-0">
                <Link prefetch={false} href={base} className="flex items-center gap-3 p-3 transition-colors hover:bg-black/30">
                  <div
                    className={`relative h-12 w-9 shrink-0 overflow-hidden rounded ${
                      movie.posterUrl ? "bg-black" : `bg-gradient-to-br ${movie.gradient}`
                    }`}
                  >
                    {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} sizes="36px" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{movie.title}</p>
                    {reviewContent ? (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{reviewContent}</p>
                    ) : (
                      <p className="text-[11px] text-muted">{hasOverall ? "내 평점" : "항목별 평가만 남김"}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-muted">{formatDate(movie.ratedAt)}</p>
                    {hasOverall && (
                      <div className="mt-0.5">
                        <StarRating rating={movie.rating} scale={10} size="h-3 w-3" />
                      </div>
                    )}
                  </div>
                </Link>
                {categoryEntries.length > 0 && (
                  <ul className="pb-2 pl-[60px] pr-3">
                    {categoryEntries.map((entry) => (
                      <li key={entry.category}>
                        <Link prefetch={false}
                          href={`${base}/category/${encodeURIComponent(entry.category)}`}
                          className="flex items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-black/30"
                        >
                          <span className="w-8 shrink-0 text-[11px] font-semibold text-text/80">{entry.category}</span>
                          <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{entry.content}</span>
                          <StarRating rating={entry.rating} scale={10} size="h-3 w-3" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
