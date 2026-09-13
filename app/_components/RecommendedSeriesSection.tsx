"use client";

import { useEffect, useState } from "react";
import MovieRow from "./MovieRow";
import { getMyMovieRatingsSnapshot } from "../_lib/reviews-store";
import type { RowMovie } from "../_lib/movie-rows";

export default function RecommendedSeriesSection() {
  const [series, setSeries] = useState<RowMovie[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const myRatings = getMyMovieRatingsSnapshot().map((r) => ({
      movieId: r.id,
      rating: r.rating,
      ratedAt: r.ratedAt,
    }));

    fetch("/api/recommendations/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ myRatings, myCategoryRatings: [] }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data: { results?: RowMovie[] }) => setSeries(data.results ?? []))
      .catch((err) => {
        if ((err as { name?: string }).name !== "AbortError") setSeries([]);
      });

    return () => controller.abort();
  }, []);

  if (!series || series.length === 0) return null;

  return (
    <MovieRow
      title="추천 시리즈"
      subtitle="회원님이 남긴 평점을 바탕으로 추천해요"
      movies={series}
    />
  );
}
