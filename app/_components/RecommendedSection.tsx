"use client";

import { useEffect, useRef, useState } from "react";
import MovieRow from "./MovieRow";
import { getMyMovieRatingsSnapshot } from "../_lib/reviews-store";
import { RATING_CATEGORIES, getMyCategoryRating } from "../_lib/category-ratings-store";
import type { RowMovie } from "../_lib/movie-rows";

// 동일한 추천 요청이 동시에 여러 번 전송되지 않도록 진행 중인 Promise를 공유한다.
// 컴포넌트 인스턴스가 여러 개 생기거나 React StrictMode 이중 실행 시에도 네트워크 요청은 1회만 발생한다.
let inFlightMovieRec: Promise<RowMovie[]> | null = null;

export default function RecommendedSection() {
  const [movies, setMovies] = useState<RowMovie[] | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const myRatings = getMyMovieRatingsSnapshot().map((r) => ({
      movieId: r.id,
      rating: r.rating,
      ratedAt: r.ratedAt,
    }));

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

    // 진행 중인 요청이 있으면 재사용하여 중복 호출 방지
    if (!inFlightMovieRec) {
      inFlightMovieRec = fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ myRatings, myCategoryRatings }),
      })
        .then((res) => res.json())
        .then((data: { results?: RowMovie[] }) => data.results ?? [])
        .catch(() => [] as RowMovie[])
        .finally(() => { inFlightMovieRec = null; });
    }

    inFlightMovieRec.then((results) => {
      if (mounted.current) setMovies(results);
    });

    return () => { mounted.current = false; };
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
