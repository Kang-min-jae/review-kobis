"use server";

import { auth } from "../../auth";
import { db } from "./db";

export async function followUser(targetUserId: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "로그인이 필요합니다" };
  if (session.user.id === targetUserId) return { error: "자신을 팔로우할 수 없습니다" };
  // 없는 사용자 ID면 외래키 오류로 예외가 나므로 먼저 확인한다.
  const target = typeof targetUserId === "string" ? await db.user.findUnique({ where: { id: targetUserId }, select: { id: true } }) : null;
  if (!target) return { error: "사용자를 찾을 수 없습니다" };

  await db.follow.upsert({
    where: { followerId_followingId: { followerId: session.user.id, followingId: targetUserId } },
    create: { followerId: session.user.id, followingId: targetUserId },
    update: {},
  });
  return {};
}

export async function unfollowUser(targetUserId: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "로그인이 필요합니다" };

  await db.follow.deleteMany({
    where: { followerId: session.user.id, followingId: targetUserId },
  });
  return {};
}

export async function getFollowerCount(userId: string): Promise<number> {
  return db.follow.count({ where: { followingId: userId } });
}

export async function getFollowingCount(userId: string): Promise<number> {
  return db.follow.count({ where: { followerId: userId } });
}

export async function checkIsFollowing(targetUserId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  const follow = await db.follow.findUnique({
    where: { followerId_followingId: { followerId: session.user.id, followingId: targetUserId } },
  });
  return !!follow;
}

// 서버 액션은 밖에서 직접 호출할 수 있는 엔드포인트라, 아무 사용자 ID나 넘겨 다른 사람의
// 팔로잉 목록을 받아 가지 못하게 로그인한 본인 것만 돌려준다.
export async function getFollowingList(userId: string) {
  const session = await auth();
  if (!session?.user?.id || session.user.id !== userId) return [];
  const rows = await db.follow.findMany({
    where: { followerId: userId },
    include: { following: { select: { id: true, name: true, image: true, nickname: true, totalLikes: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => r.following);
}
