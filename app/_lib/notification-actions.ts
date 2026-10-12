"use server";

import { auth } from "../../auth";
import { db } from "./db";

export type LikeNotif = {
  id: string;
  likerId: string;
  likerName: string;
  likerImage: string | null;
  movieCd: string;
  movieTitle: string;
  category: string;
  likedAt: string; // ISO
};

export type FollowerNotif = {
  id: string;
  userId: string;
  name: string;
  image: string | null;
  followedAt: string;
};

export type FollowingActivityNotif = {
  id: string;
  userId: string;
  userName: string;
  userImage: string | null;
  movieCd: string;
  movieTitle: string;
  moviePoster: string | null;
  category: string;
  createdAt: string;
};

// 내 리뷰가 다른 회원들의 신고 누적으로 스포일러 표시된 내역. 리뷰 본문은 싣지 않는다.
export type SpoilerFlagNotif = {
  id: string;
  movieCd: string;
  movieTitle: string;
  category: string;
  flaggedAt: string;
};

export type Notifications = {
  likes: LikeNotif[];
  followers: FollowerNotif[];
  followingActivity: FollowingActivityNotif[];
  spoilerFlags: SpoilerFlagNotif[];
};

export async function getNotifications(): Promise<Notifications | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const [rawLikes, rawFollowers, rawActivity, rawSpoilerFlags] = await Promise.all([
    // 내 리뷰에 달린 하트
    db.reviewLike.findMany({
      where: { review: { userId }, type: "LIKE" },
      include: {
        user: { select: { id: true, name: true, image: true, nickname: true } },
        review: { select: { movieCd: true, category: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    // 나를 팔로우하는 사람
    db.follow.findMany({
      where: { followingId: userId },
      include: {
        follower: { select: { id: true, name: true, image: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // 내가 팔로우하는 사람들의 최근 리뷰
    db.review.findMany({
      where: {
        user: { followers: { some: { followerId: userId } } },
        category: "전체",
      },
      include: {
        user: { select: { id: true, name: true, image: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    // 신고 누적으로 스포일러 표시된 내 리뷰 — 컬럼이 아직 없는 DB(마이그레이션 전)에서도 알림 전체가 깨지지 않게 한다.
    db.review
      .findMany({
        where: { userId, hasSpoiler: true, spoilerFlagSource: "reports", spoilerFlaggedAt: { not: null } },
        select: { id: true, movieCd: true, category: true, spoilerFlaggedAt: true },
        orderBy: { spoilerFlaggedAt: "desc" },
        take: 20,
      })
      .catch(() => []),
  ]);

  // 영화 제목 일괄 조회
  const allMovieCds = Array.from(
    new Set([
      ...rawLikes.map((l) => l.review.movieCd),
      ...rawActivity.map((r) => r.movieCd),
      ...rawSpoilerFlags.map((r) => r.movieCd),
    ])
  );
  const cachedMovies = await db.cachedMovie.findMany({
    where: { movieCd: { in: allMovieCds } },
    select: { movieCd: true, title: true, posterUrl: true },
  });
  const movieMap = new Map(cachedMovies.map((m) => [m.movieCd, m]));

  const getTitle = (movieCd: string) =>
    movieMap.get(movieCd)?.title ?? movieCd;
  const getPoster = (movieCd: string) =>
    movieMap.get(movieCd)?.posterUrl ?? null;
  const getName = (u: { name: string | null; nickname: string | null }) =>
    u.nickname ?? u.name ?? "사용자";

  const likes: LikeNotif[] = rawLikes.map((l) => ({
    id: l.id,
    likerId: l.user.id,
    likerName: getName(l.user),
    likerImage: l.user.image,
    movieCd: l.review.movieCd,
    movieTitle: getTitle(l.review.movieCd),
    category: l.review.category,
    likedAt: l.createdAt.toISOString(),
  }));

  const followers: FollowerNotif[] = rawFollowers.map((f) => ({
    id: f.id,
    userId: f.follower.id,
    name: getName(f.follower),
    image: f.follower.image,
    followedAt: f.createdAt.toISOString(),
  }));

  const followingActivity: FollowingActivityNotif[] = rawActivity.map((r) => ({
    id: r.id,
    userId: r.user.id,
    userName: getName(r.user),
    userImage: r.user.image,
    movieCd: r.movieCd,
    movieTitle: getTitle(r.movieCd),
    moviePoster: getPoster(r.movieCd),
    category: r.category,
    createdAt: r.createdAt.toISOString(),
  }));

  const spoilerFlags: SpoilerFlagNotif[] = rawSpoilerFlags.map((r) => ({
    id: r.id,
    movieCd: r.movieCd,
    movieTitle: getTitle(r.movieCd),
    category: r.category,
    flaggedAt: (r.spoilerFlaggedAt ?? new Date()).toISOString(),
  }));

  return { likes, followers, followingActivity, spoilerFlags };
}
