"use client";

import { useMemo, useSyncExternalStore } from "react";
import MovieRow from "./MovieRow";
import { subscribe, getReviewsVersion, getCombinedRatingSnapshot } from "../_lib/reviews-store";
import type { RowMovie } from "../_lib/movie-rows";

// "Best" 행은 우리 사이트 평점(한줄평+장문평 정규화 평균) 높은 순으로 정렬하고,
// 평점이 같으면 참여 평점 수가 많은 영화를 위로 올린다. 평점 데이터는 localStorage에만
// 있어 서버 컴포넌트에서 정렬할 수 없으므로, 서버가 가져온 movies를 그대로 받아서
// 클라이언트에서 재정렬한다.
export default function RatingSortedMovieRow({
  title,
  subtitle,
  movies,
}: {
  title: string;
  subtitle?: string;
  movies: RowMovie[];
}) {
  const version = useSyncExternalStore(subscribe, getReviewsVersion, getReviewsVersion);

  const sorted = useMemo(() => {
    return [...movies].sort((a, b) => {
      const ratingA = getCombinedRatingSnapshot(a.id);
      const ratingB = getCombinedRatingSnapshot(b.id);
      const avgA = ratingA.average ?? -1;
      const avgB = ratingB.average ?? -1;
      if (avgA !== avgB) return avgB - avgA;
      return ratingB.count - ratingA.count;
    });
    // version이 바뀌면(리뷰 추가/변경) 다시 계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies, version]);

  return <MovieRow title={title} subtitle={subtitle} movies={sorted} />;
}
