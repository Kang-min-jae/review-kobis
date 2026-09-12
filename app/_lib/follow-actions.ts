"use server";

import { auth } from "../../auth";
import { db } from "./db";

export async function followUser(targetUserId: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "로그인이 필요합니다" };
  if (session.user.id === targetUserId) return { error: "자신을 팔로우할 수 없습니다" };

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

export async function getFollowingList(userId: string) {
  const rows = await db.follow.findMany({
    where: { followerId: userId },
    include: { following: { select: { id: true, name: true, image: true, nickname: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => r.following);
}
