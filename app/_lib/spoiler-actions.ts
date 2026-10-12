"use server";

import { db } from "./db";
import { auth } from "../../auth";
import { SPOILER_REPORT_THRESHOLD } from "./spoiler";

export type SpoilerReportResult =
  | { ok: true; alreadyReported: boolean; flagged: boolean }
  | { ok: false; error: "login" | "not-found" | "own-review" };

// "스포일러 신고" — 한 회원은 한 리뷰를 한 번만 신고할 수 있다(SpoilerReport의 unique 제약).
// 서로 다른 신고자가 SPOILER_REPORT_THRESHOLD명이 되면 스포일러로 자동 표시하고, 출처를
// "reports"로 남긴다(작성자 알림에 쓰임). 신고자 목록은 화면 어디에도 내보내지 않는다.
export async function reportSpoilerAction(reviewId: string): Promise<SpoilerReportResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "login" };
  const userId = session.user.id;
  if (typeof reviewId !== "string" || reviewId.length === 0 || reviewId.length > 64) return { ok: false, error: "not-found" };

  const review = await db.review.findUnique({ where: { id: reviewId }, select: { userId: true, hasSpoiler: true } });
  if (!review) return { ok: false, error: "not-found" };
  if (review.userId === userId) return { ok: false, error: "own-review" };

  const created = await db.spoilerReport
    .create({ data: { reviewId, userId } })
    .then(() => true)
    .catch((error: { code?: string }) => {
      if (error?.code === "P2002") return false; // 이미 신고함
      throw error;
    });

  if (review.hasSpoiler) return { ok: true, alreadyReported: !created, flagged: true };

  const reporters = await db.spoilerReport.count({ where: { reviewId } });
  if (reporters < SPOILER_REPORT_THRESHOLD) return { ok: true, alreadyReported: !created, flagged: false };

  // 동시에 여러 명이 신고해도 한 번만 표시되도록 "아직 안 켜진 경우"에만 바꾼다.
  await db.review.updateMany({
    where: { id: reviewId, hasSpoiler: false },
    data: { hasSpoiler: true, spoilerFlagSource: "reports", spoilerFlaggedAt: new Date() },
  });
  return { ok: true, alreadyReported: !created, flagged: true };
}

// "스포일러 항상 보기" 회원 설정(기본 꺼짐).
export async function setAlwaysShowSpoilersAction(enabled: boolean): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  if (typeof enabled !== "boolean") return { ok: false };
  await db.user.update({ where: { id: session.user.id }, data: { alwaysShowSpoilers: enabled } });
  return { ok: true };
}
