"use server";

import { auth } from "../../auth";
import { getMyReviewsForSync, type SyncedReview } from "./my-rated-movies";

// 로그인한 사용자의 DB 리뷰 전체 — 브라우저 저장소의 "내 평점"을 서버 기준으로 맞출 때 쓴다(MyReviewsSync).
export async function getMyReviewsForSyncAction(): Promise<SyncedReview[] | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return getMyReviewsForSync(userId).catch(() => null);
}
