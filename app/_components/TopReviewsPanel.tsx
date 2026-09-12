"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  subscribe,
  getCombinedRatingSnapshot,
  getMyReviewsSnapshot,
  getServerMyReviewsSnapshot,
} from "../_lib/reviews-store";

// 카드를 펼쳤을 때(hover/탭) 포스터 옆에 뜨는 패널 — 내 평점(있으면)과 좋아요 많은 리뷰를 보여준다.
// "다른 사람" 리뷰는 서버 데이터가 없으면 localStorage 데이터가 오염될 수 있어 제외한다.
export default function TopReviewsPanel({ movieId }: { movieId: string }) {
  const myReviews = useSyncExternalStore(subscribe, getMyReviewsSnapshot, getServerMyReviewsSnapshot);
  const { average, count } = getCombinedRatingSnapshot(movieId);

  const myReview = useMemo(
    () => myReviews.find((r) => r.movieId === movieId && r.type === "short" && (r.category ?? "전체") === "전체") ?? null,
    [myReviews, movieId]
  );

  return (
    <div className="absolute left-full top-0 z-20 ml-2 w-44 rounded-lg border border-neutral-700 bg-surface p-3 shadow-xl sm:w-52">
      <p className="text-xs font-semibold text-text">
        평점 <span className="text-star">{average !== null ? (average * 10).toFixed(1) : "-"}</span>
        {count > 0 && <span className="text-muted"> ({count}명)</span>}
      </p>

      {myReview ? (
        <div className="mt-2 rounded bg-star/10 px-2 py-1.5 ring-1 ring-inset ring-star/30">
          <p className="text-[10px] font-semibold text-star">내 평점</p>
          <span className="text-[11px] font-bold text-star">★ {myReview.rating.toFixed(1)}</span>
          {myReview.content ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-text">{myReview.content}</p>
          ) : (
            <p className="mt-0.5 text-[10px] text-muted">한줄평 없음</p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted">아직 평점이 없어요.</p>
      )}
    </div>
  );
}
