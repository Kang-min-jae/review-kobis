import SiteHeader from "../../_components/SiteHeader";
import UserProfileView from "../../_components/UserProfileView";
import UserReviewsList from "../../_components/UserReviewsList";
import BackBar from "../../_components/BackBar";
import { auth } from "../../../auth";
import { getUserProfileData, getReviewsByUser } from "../../_lib/review-data";
import { checkIsFollowing, getFollowerCount } from "../../_lib/follow-actions";
import { notFound } from "next/navigation";

export default async function UserProfilePage({ params }: PageProps<"/users/[id]">) {
  const { id } = await params;

  const [session, profileUser, reviews, followerCount] = await Promise.all([
    auth(),
    getUserProfileData(id),
    getReviewsByUser(id),
    getFollowerCount(id),
  ]);

  if (!profileUser) notFound();

  const currentUserId = session?.user?.id ?? null;
  const isOwnProfile = currentUserId === id;
  const isFollowing = isOwnProfile ? false : await checkIsFollowing(id);

  return (
    <main>
      <SiteHeader />
      <div className="px-5 pt-4">
        <BackBar />
      </div>
      <UserProfileView
        user={{ id: profileUser.id, name: profileUser.name, image: profileUser.image, nickname: profileUser.nickname }}
        followerCount={followerCount}
        isFollowing={isFollowing}
        isOwnProfile={isOwnProfile}
      />
      <UserReviewsList reviews={reviews} />
    </main>
  );
}
