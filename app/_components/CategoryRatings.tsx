"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  subscribe,
  getVersion,
  getCategoryAverage,
  RATING_CATEGORIES,
} from "../_lib/category-ratings-store";

// 전체/연출/연기/각본/음악/편집을 세로로 나열한다. 각 항목을 누르면 그 항목에 평점을
// 남길 수 있는 페이지로 이동하고, 항목 이름 옆에는 사용자들이 남긴 평점의 평균이 뜬다.
export default function CategoryRatings({ movieId }: { movieId: string }) {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);

  const averages = useMemo(() => {
    return RATING_CATEGORIES.map((category) => ({
      category,
      ...getCategoryAverage(movieId, category),
    }));
    // version이 바뀌면(평점 등록/수정) 다시 계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId, version]);

  return (
    <div className="w-full shrink-0 rounded-lg border border-neutral-700 bg-surface p-4 sm:w-60">
      <h2 className="text-sm font-bold text-text">항목별 평점</h2>

      <div className="mt-3 space-y-1">
        {averages.map(({ category, average, count }) => (
          <Link
            key={category}
            href={`/movies/${movieId}/rate/category/${encodeURIComponent(category)}`}
            className="flex items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors hover:bg-black/30"
          >
            <span className="text-text">{category}</span>
            <span className="flex items-center gap-1 text-star">
              <span className="font-bold">{average !== null ? average.toFixed(1) : "-"}</span>
              {count > 0 && <span className="text-[10px] text-muted">({count})</span>}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
