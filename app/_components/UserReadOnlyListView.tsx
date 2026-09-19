"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import ScrollRow from "./ScrollRow";
import StarRating from "./StarRating";
import MovieDiaryCalendar from "./MovieDiaryCalendar";
import MyRatedMoviesSection from "./MyRatedMoviesSection";
import UserStyleReport from "./UserStyleReport";
import UserReviewsPanel from "./UserReviewsPanel";
import type { MyRatedMovie } from "../_lib/my-rated-movies";
import type { UserReviewStats, UserReview } from "../_lib/review-data";

function movieCdFromId(id: string): string {
  return id.startsWith("kobis-") ? id.slice("kobis-".length) : id;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function UserMovieSearch({
  movies,
  userName,
  reviewMap,
}: {
  movies: MyRatedMovie[];
  userName: string;
  reviewMap: Map<string, UserReview[]>;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return movies.filter((m) => m.title.toLowerCase().includes(q)).slice(0, 10);
  }, [query, movies]);

  return (
    <div className="mt-6">
      <p className="mb-2 text-xs text-muted">{userName}님이 평점을 남긴 영화 검색</p>
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
            const reviews = reviewMap.get(movieCdFromId(movie.id)) ?? [];
            const shortReview = reviews.find((r) => r.type === "SHORT" && r.content.trim());
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
                  {shortReview ? (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{shortReview.content}</p>
                  ) : (
                    <p className="text-[11px] text-muted">{userName}님의 평점</p>
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

function ReadOnlyMovieCard({
  movie,
  reviewMap,
  userName,
}: {
  movie: MyRatedMovie;
  reviewMap: Map<string, UserReview[]>;
  userName: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [panelSide, setPanelSide] = useState<"right" | "left">("right");
  const cardRef = useRef<HTMLDivElement>(null);
  const href = movie.id.startsWith("tmdb-tv-") ? `/series/${movie.id}/rate` : `/movies/${movie.id}/rate`;
  const reviews = reviewMap.get(movieCdFromId(movie.id)) ?? [];

  useEffect(() => {
    if (revealed && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setPanelSide(window.innerWidth - rect.right < 240 ? "left" : "right");
    }
  }, [revealed]);

  return (
    <div
      ref={cardRef}
      className="relative w-32 shrink-0"
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
    >
      <Link
        href={href}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className={`relative block aspect-2/3 overflow-hidden rounded-lg ${
          movie.posterUrl ? "bg-surface" : `bg-gradient-to-br ${movie.gradient}`
        }`}
      >
        {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
      </Link>
      <p className="mt-2 line-clamp-2 text-xs font-medium text-text">{movie.title}</p>
      <div className="mt-1">
        <StarRating rating={movie.rating} scale={10} size="h-3 w-3" />
      </div>
      {revealed && reviews.length > 0 && (
        <UserReviewsPanel reviews={reviews} userName={userName} side={panelSide} />
      )}
    </div>
  );
}

export default function UserReadOnlyListView({
  movies,
  userName,
  reviewStats,
  userReviews,
}: {
  movies: MyRatedMovie[];
  userName: string;
  reviewStats: UserReviewStats;
  userReviews: UserReview[];
}) {
  const reviewMap = new Map<string, UserReview[]>();
  for (const review of userReviews) {
    const arr = reviewMap.get(review.movieCd) ?? [];
    arr.push(review);
    reviewMap.set(review.movieCd, arr);
  }

  const topRated = [...movies].sort((a, b) => b.rating - a.rating);
  const recentRated = [...movies].sort((a, b) => (a.ratedAt < b.ratedAt ? 1 : -1));

  if (movies.length === 0) {
    return (
      <div className="px-5 py-6 text-sm text-muted">
        {userName}님이 아직 평가한 영화가 없어요.
      </div>
    );
  }

  return (
    <div className="px-5 py-6">
      <MovieDiaryCalendar reviews={[]} serverRatedMovies={movies} readOnly />

      <UserMovieSearch movies={movies} userName={userName} reviewMap={reviewMap} />

      {topRated.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold text-text">{userName}님이 높게 평가한 작품</h2>
          <ScrollRow className="row-scrollbar mt-3 flex gap-4 overflow-x-auto pb-3">
            {topRated.map((movie) => (
              <ReadOnlyMovieCard key={movie.id} movie={movie} reviewMap={reviewMap} userName={userName} />
            ))}
          </ScrollRow>
        </div>
      )}

      {recentRated.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold text-text">최근에 평가한 작품</h2>
          <ScrollRow className="row-scrollbar mt-3 flex gap-4 overflow-x-auto pb-3">
            {recentRated.map((movie) => (
              <ReadOnlyMovieCard key={`recent-${movie.id}`} movie={movie} reviewMap={reviewMap} userName={userName} />
            ))}
          </ScrollRow>
        </div>
      )}

      <MyRatedMoviesSection movies={movies} userName={userName} />

      <div className="mt-6">
        <UserStyleReport
          stats={reviewStats}
          userName={userName}
          topMovies={[...movies].sort((a, b) => b.rating - a.rating).slice(0, 10)}
        />
      </div>
    </div>
  );
}
