"use server";

import { auth } from "../../auth";
import { db } from "./db";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// 프로필 소유자(targetUserId)가 아닌 다른 사용자가 방문할 때만 카운트를 올린다.
export async function incrementProfileView(targetUserId: string): Promise<void> {
  const session = await auth();
  if (session?.user?.id === targetUserId) return; // 본인 방문은 카운트 안 함

  const today = todayKey();
  const user = await db.user.findUnique({
    where: { id: targetUserId },
    select: { profileViewsDate: true },
  });
  if (!user) return;

  if (user.profileViewsDate === today) {
    await db.user.update({
      where: { id: targetUserId },
      data: { profileViewsTotal: { increment: 1 }, profileViewsToday: { increment: 1 } },
    });
  } else {
    // 날짜가 바뀌면 오늘 카운터 리셋
    await db.user.update({
      where: { id: targetUserId },
      data: { profileViewsTotal: { increment: 1 }, profileViewsToday: 1, profileViewsDate: today },
    });
  }
}

export async function getProfileViews(userId: string): Promise<{ today: number; total: number }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { profileViewsTotal: true, profileViewsToday: true, profileViewsDate: true },
  });
  if (!user) return { today: 0, total: 0 };

  const today = todayKey();
  const todayCount = user.profileViewsDate === today ? user.profileViewsToday : 0;
  return { today: todayCount, total: user.profileViewsTotal };
}
