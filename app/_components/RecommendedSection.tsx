"use client";

import { useEffect, useRef, useState } from "react";
import MovieRow from "./MovieRow";
import RowSkeleton from "./RowSkeleton";
import { subscribe as subscribeReviews } from "../_lib/reviews-store";
import { buildRatingsPayload, type RatingsPayload } from "../_lib/rating-payload";
import type { RowMovie } from "../_lib/movie-rows";

// 같은 요청(평점·장르·편수)이 동시에 여러 번 나가지 않도록 진행 중인 요청을 공유하고,
// 홈으로 다시 돌아왔을 때 같은 입력이면 성공 결과를 잠시 재사용한다(평점이 바뀌면
// 요청 본문이 달라져 새로 받는다). 홈 추천과 장르별 추천은 본문이 달라 서로 섞이지 않는다.
const CLIENT_REC_TTL_MS = 5 * 60 * 1000;
const inFlight = new Map<string, Promise<RowMovie[]>>();
const resultCache = new Map<string, { results: RowMovie[]; at: number }>();

function fetchRecommendations(payload: RatingsPayload, genre: string | undefined, limit: number): Promise<RowMovie[]> {
  const body = JSON.stringify({ ...payload, genre, limit });
  const cached = resultCache.get(body);
  if (cached && Date.now() - cached.at < CLIENT_REC_TTL_MS) return Promise.resolve(cached.results);
  const existing = inFlight.get(body);
  if (existing) return existing;
  // 평점이 없으면 모두에게 같은 결과라 CDN이 캐시하는 GET으로 받는다(방문마다 서버 함수·DB를 쓰지 않는다).
  const coldStart = payload.myRatings.length === 0 && payload.myCategoryRatings.length === 0;
  const request = coldStart
    ? fetch(`/api/recommendations?${new URLSearchParams({ ...(genre ? { genre } : {}), limit: String(limit) })}`)
    : fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  const promise = request
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`); // 실패 응답을 빈 추천으로 캐시하지 않는다
      return res.json();
    })
    .then((data: { results?: RowMovie[] }) => {
      const results = data.results ?? [];
      resultCache.set(body, { results, at: Date.now() });
      return results;
    })
    .catch(() => [] as RowMovie[])
    .finally(() => inFlight.delete(body));
  inFlight.set(body, promise);
  return promise;
}

export default function RecommendedSection({
  genre,
  limit = 10,
  title = "사용자 추천 영화",
  subtitle = "회원님이 남긴 평점을 바탕으로 추천해요",
}: {
  genre?: string;
  limit?: number;
  title?: string;
  subtitle?: string;
}) {
  const [movies, setMovies] = useState<RowMovie[] | null>(null);
  const mounted = useRef(true);
  // 최초 fetch가 cold-start(평점 없음)였는지 추적 — 평점이 생기면 다시 요청한다
  const wasColdStart = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const show = (results: RowMovie[]) => {
      if (mounted.current) setMovies(results);
    };

    const payload = buildRatingsPayload();
    wasColdStart.current = payload.myRatings.length === 0;
    fetchRecommendations(payload, genre, limit).then(show);

    // 최초 fetch가 cold-start였으면 평점 스토어를 구독해서 평점이 생기는 순간 한 번 재요청한다
    const unsubscribe = subscribeReviews(() => {
      if (!wasColdStart.current || !mounted.current) return;
      const next = buildRatingsPayload();
      if (next.myRatings.length === 0) return;
      wasColdStart.current = false;
      fetchRecommendations(next, genre, limit).then(show);
    });

    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [genre, limit]);

  if (movies === null) return <RowSkeleton />;
  if (movies.length === 0) return null;

  return <MovieRow title={title} subtitle={subtitle} movies={movies} />;
}
