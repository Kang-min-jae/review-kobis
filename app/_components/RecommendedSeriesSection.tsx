"use client";

import { useEffect, useRef, useState } from "react";
import MovieRow from "./MovieRow";
import RowSkeleton from "./RowSkeleton";
import { buildRatingsPayload } from "../_lib/rating-payload";
import type { RowMovie } from "../_lib/movie-rows";

// 진행 중인 요청 — 같은 내용(평점·개수)일 때만 함께 쓴다(영화 탭 15편과 시리즈물 탭 20편은 따로).
let inFlightSeriesRec: { body: string; promise: Promise<RowMovie[]> } | null = null;
// 홈으로 다시 돌아올 때 같은 평점이면 직전 추천을 잠시 재사용한다.
const CLIENT_REC_TTL_MS = 5 * 60 * 1000;
let lastSeriesRec: { body: string; results: RowMovie[]; at: number } | null = null;

export default function RecommendedSeriesSection({
  limit = 15,
  title = "추천 시리즈",
}: {
  limit?: number;
  title?: string;
} = {}) {
  const [series, setSeries] = useState<RowMovie[] | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // 영화 추천과 같은 평점 데이터(전체 평점 + 항목 평점)를 보낸다 — 추천도 배지를 모든
    // 행과 같은 공식으로 계산하려면 영화 평점까지 포함한 전체 취향이 필요하다.
    const body = JSON.stringify({ ...buildRatingsPayload(), limit });
    const cached = lastSeriesRec && lastSeriesRec.body === body && Date.now() - lastSeriesRec.at < CLIENT_REC_TTL_MS
      ? Promise.resolve(lastSeriesRec.results)
      : null;
    if (!cached && inFlightSeriesRec?.body !== body) {
      const promise = fetch("/api/recommendations/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`); // 실패 응답을 빈 추천으로 캐시하지 않는다
          return res.json();
        })
        .then((data: { results?: RowMovie[] }) => {
          const results = data.results ?? [];
          lastSeriesRec = { body, results, at: Date.now() };
          return results;
        })
        .catch(() => [] as RowMovie[])
        .finally(() => {
          if (inFlightSeriesRec?.promise === promise) inFlightSeriesRec = null;
        });
      inFlightSeriesRec = { body, promise };
    }

    (cached ?? inFlightSeriesRec?.promise)?.then((results) => {
      if (mounted.current) setSeries(results);
    });

    return () => { mounted.current = false; };
  }, [limit]);

  if (series === null) return <RowSkeleton />;
  if (series.length === 0) return null;

  return (
    <MovieRow
      title={title}
      subtitle="회원님이 남긴 평점을 바탕으로 추천해요"
      movies={series}
    />
  );
}
