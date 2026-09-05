"use server";

import type { Session } from "next-auth";
import { db } from "./db";
import { auth } from "../../auth";

function requireUserId(session: Session | null): string {
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  return session.user.id;
}

// 리뷰 좋아요를 토글한다 — 좋아요를 누르면 Review.likeCount와, 그 리뷰를 쓴
// 사람(User.totalLikes, 등급 계산용)을 함께 +1 하고, 취소하면 함께 -1 한다.
// 좋아요를 누른 사람이 아니라 리뷰 작성자 쪽 totalLikes가 올라간다는 점에 주의.
export async function toggleReviewLike(reviewId: string) {
  const session = await auth();
  const userId = requireUserId(session);

  const review = await db.review.findUniqueOrThrow({ where: { id: reviewId } });

  const existing = await db.reviewLike.findUnique({
    where: { reviewId_userId: { reviewId, userId } },
  });

  if (existing) {
    await db.$transaction([
      db.reviewLike.delete({ where: { id: existing.id } }),
      db.review.update({ where: { id: reviewId }, data: { likeCount: { decrement: 1 } } }),
      db.user.update({ where: { id: review.userId }, data: { totalLikes: { decrement: 1 } } }),
    ]);
    return { liked: false };
  }

  await db.$transaction([
    db.reviewLike.create({ data: { reviewId, userId } }),
    db.review.update({ where: { id: reviewId }, data: { likeCount: { increment: 1 } } }),
    db.user.update({ where: { id: review.userId }, data: { totalLikes: { increment: 1 } } }),
  ]);
  return { liked: true };
}

// 평론가(다른 유저) 팔로우를 토글한다.
export async function toggleFollow(followingId: string) {
  const session = await auth();
  const followerId = requireUserId(session);
  if (followerId === followingId) throw new Error("자기 자신은 팔로우할 수 없습니다.");

  const existing = await db.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
  });

  if (existing) {
    await db.follow.delete({ where: { id: existing.id } });
    return { following: false };
  }

  await db.follow.create({ data: { followerId, followingId } });
  return { following: true };
}

// "이 리뷰 때문에 봤어요" 기록. 이미 기록했으면 조용히 무시한다(1인 1회).
export async function recordWatchTrigger(reviewId: string) {
  const session = await auth();
  const readerId = requireUserId(session);

  await db.watchTrigger.upsert({
    where: { reviewId_readerId: { reviewId, readerId } },
    create: { reviewId, readerId },
    update: {},
  });
}
