"use server";

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import { db } from "./db";
import { auth } from "../../auth";

function requireUserId(session: Session | null): string {
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  return session.user.id;
}

export type VoteType = "LIKE" | "DISLIKE";
export type MyVote = VoteType | null;

// from -> to 사이의 변화를 Review.likeCount/dislikeCount, User.totalLikes에
// 각각 얼마나 더하고 뺄지로 환산한다. "투표 없음"은 null로 표현한다 — 이렇게 하면
// 새로 투표/취소(토글 오프)/좋아요<->싫어요 전환 세 경우를 분기 없이 한 번에 처리할 수 있다.
// totalLikes(등급 계산용)는 좋아요만 반영하고 싫어요는 관여하지 않는다.
function computeDeltas(from: MyVote, to: MyVote) {
  const like = (to === "LIKE" ? 1 : 0) - (from === "LIKE" ? 1 : 0);
  const dislike = (to === "DISLIKE" ? 1 : 0) - (from === "DISLIKE" ? 1 : 0);
  return { like, dislike, totalLikes: like };
}

// 리뷰에 좋아요/싫어요를 투표한다. 이미 같은 투표를 눌렀으면 취소(토글 오프)하고,
// 다른 투표가 있었으면 그쪽으로 바꾼다 — 한 사람이 한 리뷰에 가질 수 있는 투표는 하나뿐.
// 좋아요를 누른 사람이 아니라 리뷰 작성자 쪽 likeCount/dislikeCount/totalLikes가 바뀐다.
export async function toggleReviewVote(reviewId: string, type: VoteType) {
  const session = await auth();
  const userId = requireUserId(session);

  const review = await db.review.findUniqueOrThrow({ where: { id: reviewId } });
  const existing = await db.reviewLike.findUnique({
    where: { reviewId_userId: { reviewId, userId } },
  });

  const from: MyVote = existing?.type ?? null;
  const to: MyVote = from === type ? null : type;
  const { like, dislike, totalLikes } = computeDeltas(from, to);

  const writes = [];
  if (to === null) {
    writes.push(db.reviewLike.delete({ where: { id: existing!.id } }));
  } else if (existing) {
    writes.push(db.reviewLike.update({ where: { id: existing.id }, data: { type: to } }));
  } else {
    writes.push(db.reviewLike.create({ data: { reviewId, userId, type: to } }));
  }
  if (like !== 0 || dislike !== 0) {
    writes.push(
      db.review.update({
        where: { id: reviewId },
        data: { likeCount: { increment: like }, dislikeCount: { increment: dislike } },
      })
    );
  }
  if (totalLikes !== 0) {
    writes.push(
      db.user.update({ where: { id: review.userId }, data: { totalLikes: { increment: totalLikes } } })
    );
  }
  await db.$transaction(writes);

  // totalLikes가 바뀌었을 때만 리뷰 작성자의 마이페이지 캐시를 무효화한다.
  if (totalLikes !== 0) {
    revalidatePath("/my-list");
  }

  return { myVote: to };
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
    revalidatePath("/my-list");
    revalidatePath(`/users/${followingId}`);
    return { following: false };
  }

  await db.follow.create({ data: { followerId, followingId } });
  revalidatePath("/my-list");
  revalidatePath(`/users/${followingId}`);
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
