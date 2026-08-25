"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import StarRating from "./StarRating";
import BackBar from "./BackBar";
import {
  subscribe,
  getVersion,
  getCategoryAverage,
  getMyCategoryRating,
  submitCategoryRating,
  type RatingCategory,
} from "../_lib/category-ratings-store";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function CategoryRateForm({
  movieId,
  movieTitle,
  category,
}: {
  movieId: string;
  movieTitle: string;
  category: RatingCategory;
}) {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const { average, count } = useMemo(
    () => getCategoryAverage(movieId, category),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movieId, category, version]
  );
  const myRating = useMemo(
    () => getMyCategoryRating(movieId, category),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movieId, category, version]
  );

  const [value, setValue] = useState(myRating ?? 8);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    submitCategoryRating(movieId, category, value);
    setSubmitted(true);
  }

  return (
    <div className="px-5 py-6">
      <BackBar />

      <p className="mt-3 text-xs text-muted">{movieTitle}</p>
      <div className="mt-1 flex items-center justify-between">
        <h1 className="text-lg font-bold text-text">{category} 평점</h1>
        <span className="text-sm text-muted">
          평균 <span className="font-bold text-star">{average !== null ? average.toFixed(1) : "-"}</span>
          {count > 0 && ` (${count}명)`}
        </span>
      </div>

      <div className="mt-8">
        <StarRating rating={value} scale={10} size="h-6 w-6" />
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={value}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isNaN(next)) {
                setValue(Math.round(clamp(next, 0, 10) * 10) / 10);
                setSubmitted(false);
              }
            }}
            className="w-24 rounded-lg border border-neutral-700 bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none"
          />
          <span className="text-xs text-muted">/ 10.0 (소수점 첫째 자리까지)</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        className="mt-6 w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
      >
        {myRating !== null ? "평점 수정하기" : "평점 등록하기"}
      </button>

      {(submitted || myRating !== null) && (
        <p className="mt-2 text-center text-xs text-muted">
          내가 남긴 {category} 평점: {(submitted ? value : myRating!).toFixed(1)}
        </p>
      )}
    </div>
  );
}
