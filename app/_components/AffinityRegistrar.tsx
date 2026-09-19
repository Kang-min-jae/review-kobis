"use client";

import { useEffect } from "react";
import { registerMovieIds } from "../_lib/affinity-store";

// MovieRow / GenreMovieRow 등 행 단위로 한 번만 registerMovieIds를 호출한다.
// 각 MovieCard가 개별 등록하던 방식 대신 행 전체 ID를 한 번에 넘겨
// 불필요한 debounce 재설정과 중복 등록을 제거한다.
export default function AffinityRegistrar({ movieIds }: { movieIds: string[] }) {
  useEffect(() => {
    if (movieIds.length > 0) registerMovieIds(movieIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 행이 처음 마운트될 때 1회만 실행
  return null;
}
