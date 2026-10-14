"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useHydrated } from "../_lib/use-hydrated";
import MovieCard from "./MovieCard";
import { subscribe, getReviewsVersion, getAverageRating } from "../_lib/reviews-store";
import type { RowMovie } from "../_lib/movie-rows";

// 평점(한줄평 평균) 높은 순으로 정렬해서 보여준다. 평점이 없는 작품은 맨 뒤로 보낸다.
// getSnapshot이 매번 새 배열을 반환하면 useSyncExternalStore가 무한 루프 경고를 내서,
// 버전 숫자만 구독하고 실제 정렬은 useMemo로 따로 계산한다.
export default function FilmographyGrid({ movies }: { movies: RowMovie[] }) {
  // getAverageRating은 localStorage를 동기적으로 읽는다. 서버 렌더·클라이언트 하이드레이션
  // 단계에서 호출하면 서버(localStorage 없음)와 클라이언트(localStorage에 평점 있음)의
  // 정렬 순서가 달라져 Hydration Mismatch가 발생한다. mounted가 true가 되는 시점(첫
  // useEffect 이후)은 항상 하이드레이션이 완료된 뒤이므로, 그전까지는 서버와 동일하게
  // 원본 순서를 그대로 유지한다.
  const mounted = useHydrated();

  const version = useSyncExternalStore(subscribe, getReviewsVersion, getReviewsVersion);

  const sorted = useMemo(() => {
    if (!mounted) return movies;
    return [...movies].sort((a, b) => {
      const ratingA = getAverageRating(a.id, "short") ?? -1;
      const ratingB = getAverageRating(b.id, "short") ?? -1;
      return ratingB - ratingA;
    });
    // version이 바뀌면(리뷰 추가/변경) 다시 계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies, version, mounted]);

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
