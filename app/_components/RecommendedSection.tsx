"use client";

import { useEffect, useRef, useState } from "react";
import MovieRow from "./MovieRow";
import RowSkeleton from "./RowSkeleton";
import { subscribe as subscribeReviews, getMyMovieRatingsSnapshot } from "../_lib/reviews-store";
import { RATING_CATEGORIES, getMyCategoryRating } from "../_lib/category-ratings-store";
import { registerMovieIds } from "../_lib/affinity-store";
import type { RowMovie } from "../_lib/movie-rows";

// 동일한 추천 요청이 동시에 여러 번 전송되지 않도록 진행 중인 Promise를 공유한다.
// 컴포넌트 인스턴스가 여러 개 생기거나 React StrictMode 이중 실행 시에도 네트워크 요청은 1회만 발생한다.
let inFlightMovieRec: Promise<RowMovie[]> | null = null;

function buildRatingsPayload() {
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
  return { myRatings, myCategoryRatings };
}

function fetchRecommendations(myRatings: ReturnType<typeof buildRatingsPayload>["myRatings"], myCategoryRatings: ReturnType<typeof buildRatingsPayload>["myCategoryRatings"]): Promise<RowMovie[]> {
  inFlightMovieRec = fetch("/api/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ myRatings, myCategoryRatings }),
  })
    .then((res) => res.json())
    .then((data: { results?: RowMovie[] }) => data.results ?? [])
    .catch(() => [] as RowMovie[])
    .finally(() => { inFlightMovieRec = null; });
  return inFlightMovieRec!;
}

export default function RecommendedSection() {
  const [movies, setMovies] = useState<RowMovie[] | null>(null);
  const mounted = useRef(true);
  // 최초 fetch가 cold-start(평점 없음)였는지 추적 — 평점이 생기면 다시 요청한다
  const wasColdStart = useRef(false);

  useEffect(() => {
    mounted.current = true;

    const { myRatings, myCategoryRatings } = buildRatingsPayload();
    wasColdStart.current = myRatings.length === 0;

    const promise = inFlightMovieRec ?? fetchRecommendations(myRatings, myCategoryRatings);

    promise.then((results) => {
      if (mounted.current) {
        if (results.length > 0) registerMovieIds(results.map((m) => m.id));
        setMovies(results);
      }
    });

    // 최초 fetch가 cold-start였으면 평점 스토어를 구독해서 평점이 생기는 순간 재요청한다
    const unsubscribe = subscribeReviews(() => {
      if (!wasColdStart.current || !mounted.current) return;
      const { myRatings: newRatings, myCategoryRatings: newCatRatings } = buildRatingsPayload();
      if (newRatings.length === 0) return;
      // 평점이 생겼으므로 더 이상 cold-start가 아님 — 한 번만 재요청
      wasColdStart.current = false;
      if (!inFlightMovieRec) {
        fetchRecommendations(newRatings, newCatRatings).then((results) => {
          if (mounted.current) {
            if (results.length > 0) registerMovieIds(results.map((m) => m.id));
            setMovies(results);
          }
        });
      }
    });

    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, []);

  if (movies === null) return <RowSkeleton />;
  if (movies.length === 0) return null;

  return (
    <MovieRow
      title="사용자 추천 영화"
      subtitle="회원님이 남긴 평점을 바탕으로 추천해요"
      movies={movies}
    />
  );
}
