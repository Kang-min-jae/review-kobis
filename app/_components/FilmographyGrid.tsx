"use client";

import { useMemo } from "react";
import { useSyncExternalStore } from "react";
import MovieCard from "./MovieCard";
import { subscribe, getReviewsVersion, getAverageRating } from "../_lib/reviews-store";
import type { RowMovie } from "../_lib/movie-rows";

// 평점(한줄평 평균) 높은 순으로 정렬해서 보여준다. 평점이 없는 작품은 맨 뒤로 보낸다.
// getSnapshot이 매번 새 배열을 반환하면 useSyncExternalStore가 무한 루프 경고를 내서,
// 버전 숫자만 구독하고 실제 정렬은 useMemo로 따로 계산한다.
export default function FilmographyGrid({ movies }: { movies: RowMovie[] }) {
  const version = useSyncExternalStore(subscribe, getReviewsVersion, getReviewsVersion);

  const sorted = useMemo(() => {
    return [...movies].sort((a, b) => {
      const ratingA = getAverageRating(a.id, "short") ?? -1;
      const ratingB = getAverageRating(b.id, "short") ?? -1;
      return ratingB - ratingA;
    });
    // version이 바뀌면(리뷰 추가/변경) 다시 계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies, version]);

  if (sorted.length === 0) {
    return <p className="mt-2 text-sm text-muted">참여작을 찾을 수 없어요.</p>;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-4">
      {sorted.map((movie) => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </div>
  );
}
