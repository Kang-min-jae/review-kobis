"use client";

import { useEffect, useRef, useState } from "react";
import MovieRow from "./MovieRow";
import RowSkeleton from "./RowSkeleton";
import { getMyMovieRatingsSnapshot } from "../_lib/reviews-store";
import { registerMovieIds } from "../_lib/affinity-store";
import type { RowMovie } from "../_lib/movie-rows";

let inFlightSeriesRec: Promise<RowMovie[]> | null = null;
// 홈으로 다시 돌아올 때 같은 평점이면 직전 추천을 잠시 재사용한다.
const CLIENT_REC_TTL_MS = 5 * 60 * 1000;
let lastSeriesRec: { body: string; results: RowMovie[]; at: number } | null = null;

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

    const body = JSON.stringify({ myRatings, myCategoryRatings: [] });
    const cached = lastSeriesRec && lastSeriesRec.body === body && Date.now() - lastSeriesRec.at < CLIENT_REC_TTL_MS
      ? Promise.resolve(lastSeriesRec.results)
      : null;
    if (!cached && !inFlightSeriesRec) {
      inFlightSeriesRec = fetch("/api/recommendations/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      })
        .then((res) => res.json())
        .then((data: { results?: RowMovie[] }) => {
          const results = data.results ?? [];
          lastSeriesRec = { body, results, at: Date.now() };
          return results;
        })
        .catch(() => [] as RowMovie[])
        .finally(() => { inFlightSeriesRec = null; });
    }

    (cached ?? inFlightSeriesRec)?.then((results) => {
      if (mounted.current) {
        if (results.length > 0) registerMovieIds(results.map((m) => m.id));
        setSeries(results);
      }
    });

    return () => { mounted.current = false; };
  }, []);

  if (series === null) return <RowSkeleton />;
  if (series.length === 0) return null;

  return (
    <MovieRow
      title="추천 시리즈"
      subtitle="회원님이 남긴 평점을 바탕으로 추천해요"
      movies={series}
    />
  );
}
