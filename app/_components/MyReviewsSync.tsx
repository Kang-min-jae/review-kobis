"use client";

import { useEffect } from "react";
import { initForUser, replaceWithServerReviews, switchToUser } from "../_lib/reviews-store";
import { getMyReviewsForSyncAction } from "../_lib/review-sync-actions";

// 카드의 "추천 N%" 배지, 사용자 추천 영화, 카드 위 내 별점은 브라우저 저장소의 "내 평점"으로 계산한다.
// 예전엔 이 저장소를 서버(DB)와 맞추는 일이 /my-list 페이지에서만 일어나서, 다른 기기(예: PC)에서
// 평점을 남긴 뒤 휴대폰으로 홈에 들어오면 휴대폰 저장소가 비어 "평점 없는 사용자"로 취급돼 추천도가
// 안 떴다. 헤더(모든 페이지)에서 로그인 계정의 저장소로 바꾸고 서버 평점으로 맞춘다.
// 같은 탭에서는 SYNC_INTERVAL_MS마다 한 번만 서버에 묻는다(페이지를 옮길 때마다 조회하지 않음).
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const SYNC_KEY = "review-site:last-server-sync";

export default function MyReviewsSync({ userId }: { userId: string | null }) {
  useEffect(() => {
    switchToUser(userId);
    if (!userId) return;

    let last = 0;
    try {
      const raw = window.sessionStorage.getItem(SYNC_KEY);
      const parsed = raw ? (JSON.parse(raw) as { userId?: string; at?: number }) : null;
      if (parsed?.userId === userId && typeof parsed.at === "number") last = parsed.at;
    } catch {
      // 저장소를 못 읽으면 그냥 동기화한다.
    }
    if (Date.now() - last < SYNC_INTERVAL_MS) return;

    let cancelled = false;
    getMyReviewsForSyncAction()
      .then((reviews) => {
        if (cancelled || !reviews) return;
        initForUser(userId);
        replaceWithServerReviews(reviews);
        try {
          window.sessionStorage.setItem(SYNC_KEY, JSON.stringify({ userId, at: Date.now() }));
        } catch {
          // 무시 — 다음 페이지에서 한 번 더 동기화될 뿐이다.
        }
      })
      .catch(() => {
        // 네트워크 오류 — 다음 페이지 이동 때 다시 시도한다.
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return null;
}
