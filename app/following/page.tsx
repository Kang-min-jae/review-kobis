import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "../../auth";
import { getFollowingList } from "../_lib/follow-actions";
import { getBadge, TIER_STYLES, type Tier } from "../_lib/tier";
import BackBar from "../_components/BackBar";

export const metadata = { title: "팔로잉 목록" };

export default async function FollowingPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login?callbackUrl=/following");

  const followingList = await getFollowingList(userId);

  return (
    <div className="mx-auto max-w-lg px-4 pb-12 pt-4">
      <BackBar />
      <h1 className="mt-4 text-xl font-bold text-text">팔로잉 목록</h1>
      <p className="mt-1 text-sm text-muted">내가 팔로우하는 사람들이에요.</p>

      <div className="mt-5 space-y-2">
        {followingList.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">아직 팔로우한 사람이 없어요.</p>
        ) : (
          followingList.map((user) => {
            const name = user.nickname ?? user.name ?? "사용자";
            const tier = getBadge(user.totalLikes ?? 0);
            const tierStyle = TIER_STYLES[tier as Tier];
            return (
              <Link
                key={user.id}
                href={`/users/${user.id}`}
                className="flex items-center gap-3 rounded-lg bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
              >
                <span
                  className={`shrink-0 rounded border px-2 py-1 text-xs font-bold ${tierStyle.border} ${tierStyle.text} ${tierStyle.bg}`}
                >
                  {tier}
                </span>
                <span className="flex-1 truncate text-sm text-text">{name}</span>
                <span className="text-xs text-muted">→</span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
