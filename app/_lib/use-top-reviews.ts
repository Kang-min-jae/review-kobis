"use client";

import { useEffect, useState } from "react";
import type { TopReview } from "../api/reviews/top/route";

export type { TopReview };

// 모듈 레벨 캐시 — 같은 movieCd를 여러 컴포넌트가 요청해도 한 번만 fetch한다. 10분만 쓰고 다시 받는다
// (다시 받아도 대부분 CDN 캐시에서 온다) — 예전엔 페이지를 새로고침하기 전까지 처음 받은 결과(빈 목록 포함)가 그대로 남았다.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cacheStore = new Map<string, { list: TopReview[]; at: number }>();
const cache = {
  get(movieCd: string): TopReview[] | undefined {
    const entry = cacheStore.get(movieCd);
    return entry && Date.now() - entry.at < CACHE_TTL_MS ? entry.list : undefined;
  },
  has(movieCd: string): boolean {
    return cache.get(movieCd) !== undefined;
  },
  set(movieCd: string, list: TopReview[]) {
    cacheStore.set(movieCd, { list, at: Date.now() });
  },
};
const inflight = new Map<string, Promise<TopReview[]>>();

const EMPTY: TopReview[] = [];

// 카드의 한줄평 수·평균으로 만든 버전 문자열. 둘 다 없으면(아직 한줄평 없음) "0".
export function topReviewsVersion(movie: { shortCount?: number | null; shortAvg?: number | null }): string {
  return `${movie.shortCount ?? 0}-${movie.shortAvg != null ? movie.shortAvg.toFixed(2) : "x"}`;
}

// 캐시 키 — 같은 영화라도 한줄평 수·평균(version)이 바뀌면 다른 키가 된다.
function keyOf(movieCd: string, version: string | null): string {
  return version ? `${movieCd}|${version}` : movieCd;
}

async function fetchTopReviews(movieCd: string, version: string | null): Promise<TopReview[]> {
  const key = keyOf(movieCd, version);
  const existing = inflight.get(key);
  if (existing) return existing;
  // version을 주소에 넣어 CDN 캐시 항목도 갈라 쓴다 — 새 한줄평이 달리면(수·평균이 바뀌면) 1분 캐시된
  // 예전 목록 대신 새로 받아 온다. 바뀐 게 없으면 같은 주소라 CDN 캐시를 그대로 쓴다.
  const query = `movieCd=${encodeURIComponent(movieCd)}${version ? `&v=${encodeURIComponent(version)}` : ""}`;
  const promise = fetch(`/api/reviews/top?${query}`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ reviews?: TopReview[] }>;
    })
    .then(({ reviews }) => {
      const list = Array.isArray(reviews) ? reviews : [];
      cache.set(key, list); // 실패 응답은 캐시하지 않는다(다음에 다시 시도)
      return list;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

// BoxOfficeCoverflow 뒤집기 카드와 TopReviewsPanel(호버 팝업)이 공유하는 훅.
// movieCd가 null이면 아무것도 하지 않는다 (KOBIS 영화가 아닌 경우).
//
// 결과를 "어느 영화의 결과인지"와 함께 저장하고 화면 값은 렌더링 때 계산한다. 예전엔 마지막
// 요청 영화를 ref로만 기억해서 ① A → (영화 아님) → A로 돌아오면 한줄평이 빈 채로 남고
// ② 로딩 중에 캐시된 영화로 넘어가면 로딩 표시가 끝나지 않았으며 ③ 오류 응답이면
// reviews가 undefined가 되어 목록 렌더링이 깨졌다.
// version: 카드가 이미 가진 최신 한줄평 수·평균(fresh-ratings) — 바뀌면 목록을 새로 받는다.
export function useTopReviews(
  movieCd: string | null,
  version: string | null = null,
): { reviews: TopReview[]; loading: boolean } {
  // SSR과 클라이언트 초기 렌더링이 항상 []로 일치하도록 초기값엔 캐시를 쓰지 않는다
  // (모듈 캐시는 브라우저에서만 채워진다 — fetch는 effect 안에서만 일어난다).
  const [result, setResult] = useState<{ key: string; reviews: TopReview[] } | null>(null);
  const key = movieCd ? keyOf(movieCd, version) : null;

  useEffect(() => {
    if (!movieCd || !key || cache.has(key)) return;
    let cancelled = false;
    fetchTopReviews(movieCd, version)
      .then((reviews) => { if (!cancelled) setResult({ key, reviews }); })
      .catch(() => { if (!cancelled) setResult({ key, reviews: EMPTY }); });
    return () => { cancelled = true; };
  }, [movieCd, version, key]);

  if (!key) return { reviews: EMPTY, loading: false };
  const cached = cache.get(key);
  if (cached) return { reviews: cached, loading: false };
  if (result?.key === key) return { reviews: result.reviews, loading: false };
  return { reviews: EMPTY, loading: true };
}
