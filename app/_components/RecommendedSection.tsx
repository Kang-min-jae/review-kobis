"use client";

import { useEffect, useRef, useState } from "react";
import MovieRow from "./MovieRow";
import RowSkeleton from "./RowSkeleton";
import { subscribe as subscribeReviews, getMyMovieRatingsSnapshot, getMyReviewsSnapshot } from "../_lib/reviews-store";
import { registerMovieIds } from "../_lib/affinity-store";
import type { RowMovie } from "../_lib/movie-rows";

function buildRatingsPayload() {
  const myRatings = getMyMovieRatingsSnapshot().map((r) => ({
    movieId: r.id,
    rating: r.rating,
    ratedAt: r.ratedAt,
  }));
  // 항목별(연출·연기·각본·음악·편집) 평점은 항목 리뷰로 저장된다 — 한줄평 점수(0~10)를
  // 우선 쓰고, 장문평만 있으면 0~100을 0~10으로 환산한다.
  const byKey = new Map<string, { movieId: string; category: string; value: number; short: boolean }>();
  for (const r of getMyReviewsSnapshot()) {
    const category = r.category ?? "전체";
    if (category === "전체") continue;
    const key = `${r.movieId}|${category}`;
    const short = r.type === "short";
    const prev = byKey.get(key);
    if (prev?.short && !short) continue;
    byKey.set(key, { movieId: r.movieId, category, value: short ? r.rating : r.rating / 10, short });
  }
  const myCategoryRatings = [...byKey.values()].map(({ movieId, category, value }) => ({ movieId, category, value }));
  return { myRatings, myCategoryRatings };
}

// 같은 요청(평점·장르·편수)이 동시에 여러 번 나가지 않도록 진행 중인 요청을 공유하고,
// 홈으로 다시 돌아왔을 때 같은 입력이면 성공 결과를 잠시 재사용한다(평점이 바뀌면
// 요청 본문이 달라져 새로 받는다). 홈 추천과 장르별 추천은 본문이 달라 서로 섞이지 않는다.
const CLIENT_REC_TTL_MS = 5 * 60 * 1000;
const inFlight = new Map<string, Promise<RowMovie[]>>();
const resultCache = new Map<string, { results: RowMovie[]; at: number }>();

type Payload = ReturnType<typeof buildRatingsPayload>;

function fetchRecommendations(payload: Payload, genre: string | undefined, limit: number): Promise<RowMovie[]> {
  const body = JSON.stringify({ ...payload, genre, limit });
  const cached = resultCache.get(body);
  if (cached && Date.now() - cached.at < CLIENT_REC_TTL_MS) return Promise.resolve(cached.results);
  const existing = inFlight.get(body);
  if (existing) return existing;
  const promise = fetch("/api/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
    .then((res) => res.json())
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
      if (!mounted.current) return;
      if (results.length > 0) registerMovieIds(results.map((m) => m.id));
      setMovies(results);
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
