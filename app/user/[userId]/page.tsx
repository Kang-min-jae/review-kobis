import { notFound } from "next/navigation";
import SiteHeader from "../../_components/SiteHeader";
import UserProfileView from "../../_components/UserProfileView";
import { auth } from "../../../auth";
import { db } from "../../_lib/db";
import { getFollowerCount, checkIsFollowing } from "../../_lib/follow-actions";

export default async function UserProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const [session, user, followerCount, totalLikes] = await Promise.all([
    auth(),
    db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, image: true, nickname: true },
    }),
    getFollowerCount(userId),
    db.review.aggregate({ where: { authorId: userId }, _sum: { likes: true } }).then((r) => r._sum.likes ?? 0),
  ]);

  if (!user) notFound();

  const isOwnProfile = session?.user?.id === userId;
  const isFollowing = session?.user?.id && !isOwnProfile
    ? await checkIsFollowing(userId)
    : false;

  return (
    <main>
      <SiteHeader />
      <UserProfileView
        user={user}
        totalLikes={totalLikes}
        followerCount={followerCount}
        isFollowing={isFollowing}
        isOwnProfile={isOwnProfile}
      />
    </main>
  );
}
