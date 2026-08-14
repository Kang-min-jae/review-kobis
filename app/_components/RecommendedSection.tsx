"use client";

import { useEffect, useState } from "react";
import MovieRow from "./MovieRow";
import { getUserRatedTmdbIdsSnapshot } from "../_lib/reviews-store";
import type { RowMovie } from "../_lib/movie-rows";

// 서버 컴포넌트는 이 브라우저의 localStorage(내가 남긴 평점)에 접근할 수 없어서,
// 클라이언트에서 시드를 읽어 /api/recommendations로 넘기는 방식으로 구현했다.
export default function RecommendedSection() {
  const [movies, setMovies] = useState<RowMovie[] | null>(null);

  useEffect(() => {
    const tmdbIds = getUserRatedTmdbIdsSnapshot();
    const query = tmdbIds.length > 0 ? `?tmdbIds=${tmdbIds.join(",")}` : "";

    fetch(`/api/recommendations${query}`)
      .then((res) => res.json())
      .then((data: { results?: RowMovie[] }) => setMovies(data.results ?? []))
      .catch(() => setMovies([]));
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
