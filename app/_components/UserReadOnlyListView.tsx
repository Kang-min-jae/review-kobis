"use client";

import { useState, useEffect, useRef } from "react";
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
