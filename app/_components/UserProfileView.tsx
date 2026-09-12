"use client";

import { useEffect, useState, useTransition } from "react";
import { followUser, unfollowUser } from "../_lib/follow-actions";
import { incrementProfileView } from "../_lib/profile-view-actions";

type ProfileUser = { id: string; name: string | null; image: string | null; nickname: string | null };

export default function UserProfileView({
  user,
  followerCount: initialFollowerCount,
  isFollowing: initialIsFollowing,
  isOwnProfile,
}: {
  user: ProfileUser;
  followerCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
}) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [isPending, startTransition] = useTransition();

  // 본인이 아닌 다른 사용자가 방문할 때만 조회수를 올린다.
  useEffect(() => {
    if (!isOwnProfile) {
      incrementProfileView(user.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName = user.nickname ?? user.name ?? "사용자";

  function handleFollow() {
    startTransition(async () => {
      if (isFollowing) {
        await unfollowUser(user.id);
        setIsFollowing(false);
        setFollowerCount((n) => Math.max(0, n - 1));
      } else {
        await followUser(user.id);
        setIsFollowing(true);
        setFollowerCount((n) => n + 1);
      }
    });
  }

  return (
    <div className="px-5 py-8">
      <div className="flex items-center gap-4">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="h-16 w-16 shrink-0 rounded-full" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
            {displayName.slice(0, 1)}
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-lg font-bold text-text">{displayName}</h1>
          <p className="mt-0.5 text-sm text-muted">팔로워 {followerCount}명</p>
        </div>
        {!isOwnProfile && (
          <button
            type="button"
            onClick={handleFollow}
            disabled={isPending}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
              isFollowing
                ? "border border-brand bg-brand text-white hover:bg-brand/80"
                : "border border-brand text-brand hover:bg-brand hover:text-white"
            }`}
          >
            {isFollowing ? "팔로잉" : "팔로우"}
          </button>
        )}
      </div>
    </div>
  );
}
