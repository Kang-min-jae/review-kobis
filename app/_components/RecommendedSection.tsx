"use client";

import { useEffect, useState } from "react";
import MovieRow from "./MovieRow";
import { getMyMovieRatingsSnapshot } from "../_lib/reviews-store";
import { RATING_CATEGORIES, getMyCategoryRating } from "../_lib/category-ratings-store";
import type { RowMovie } from "../_lib/movie-rows";

export default function RecommendedSection() {
  const [movies, setMovies] = useState<RowMovie[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const myRatings = getMyMovieRatingsSnapshot().map((r) => ({
      movieId: r.id,
      rating: r.rating,
      ratedAt: r.ratedAt,
    }));

    // Collect category ratings for all rated movies and all non-"전체" categories
    const myCategoryRatings: { movieId: string; category: string; value: number }[] = [];
    for (const r of myRatings) {
      for (const cat of RATING_CATEGORIES) {
        if (cat === "전체") continue;
        const value = getMyCategoryRating(r.movieId, cat);
        if (value !== null) {
          myCategoryRatings.push({ movieId: r.movieId, category: cat, value });
        }
      }
    }

    fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ myRatings, myCategoryRatings }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data: { results?: RowMovie[] }) => setMovies(data.results ?? []))
      .catch((err) => {
        if ((err as { name?: string }).name !== "AbortError") setMovies([]);
      });

    return () => controller.abort();
  }, []);

  if (!movies || movies.length === 0) return null;

  return (
    <MovieRow
      title="사용자 추천 영화"
      subtitle="회원님이 남긴 평점을 바탕으로 추천해요"
      movies={movies}
    />
  );
}
