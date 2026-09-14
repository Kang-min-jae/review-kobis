"use client";

import { useEffect, useRef, useState } from "react";
import MovieRow from "./MovieRow";
import { getMyMovieRatingsSnapshot } from "../_lib/reviews-store";
import type { RowMovie } from "../_lib/movie-rows";

let inFlightSeriesRec: Promise<RowMovie[]> | null = null;

export default function RecommendedSeriesSection() {
  const [series, setSeries] = useState<RowMovie[] | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const myRatings = getMyMovieRatingsSnapshot().map((r) => ({
      movieId: r.id,
      rating: r.rating,
      ratedAt: r.ratedAt,
    }));

    if (!inFlightSeriesRec) {
      inFlightSeriesRec = fetch("/api/recommendations/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ myRatings, myCategoryRatings: [] }),
      })
        .then((res) => res.json())
        .then((data: { results?: RowMovie[] }) => data.results ?? [])
        .catch(() => [] as RowMovie[])
        .finally(() => { inFlightSeriesRec = null; });
    }

    inFlightSeriesRec.then((results) => {
      if (mounted.current) setSeries(results);
    });

    return () => { mounted.current = false; };
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
