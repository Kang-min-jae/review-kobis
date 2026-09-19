"use client";

import { useEffect, useRef, useState } from "react";
import type { TopReview } from "../api/reviews/top/route";

export type { TopReview };

// 모듈 레벨 캐시 — 같은 movieCd를 여러 컴포넌트가 요청해도 한 번만 fetch한다.
const cache = new Map<string, TopReview[]>();
const inflight = new Map<string, Promise<TopReview[]>>();

async function fetchTopReviews(movieCd: string): Promise<TopReview[]> {
  const existing = inflight.get(movieCd);
  if (existing) return existing;
  const promise = fetch(`/api/reviews/top?movieCd=${movieCd}`)
    .then((r) => r.json() as Promise<{ reviews: TopReview[] }>)
    .then(({ reviews }) => {
      cache.set(movieCd, reviews);
      return reviews;
    })
    .finally(() => inflight.delete(movieCd));
  inflight.set(movieCd, promise);
  return promise;
}

// BoxOfficeCoverflow 뒤집기 카드와 TopReviewsPanel(호버 팝업)이 공유하는 훅.
// movieCd가 null이면 아무것도 하지 않는다 (KOBIS 영화가 아닌 경우).
export function useTopReviews(movieCd: string | null): { reviews: TopReview[]; loading: boolean } {
  // SSR과 클라이언트 초기 렌더링이 항상 []로 일치하도록 cache를 useState 초기값에 쓰지 않는다.
  // 서버 프로세스에 남아 있는 모듈 캐시 때문에 서버는 reviews가 있고 클라이언트는
  // 빈 배열인 상태가 생겨 Hydration Mismatch가 발생할 수 있다.
  const [reviews, setReviews] = useState<TopReview[]>([]);
  const [loading, setLoading] = useState(false);
  const currentCd = useRef<string | null>(null);

  useEffect(() => {
    if (!movieCd) { setReviews([]); return; }
    if (currentCd.current === movieCd) return;
    currentCd.current = movieCd;

    const cached = cache.get(movieCd);
    if (cached) { setReviews(cached); return; }

    setLoading(true);
    fetchTopReviews(movieCd)
      .then((data) => { if (currentCd.current === movieCd) setReviews(data); })
      .finally(() => { if (currentCd.current === movieCd) setLoading(false); });
  }, [movieCd]);

  return { reviews, loading };
}
