import SiteHeader from "../../_components/SiteHeader";
import UserProfileView from "../../_components/UserProfileView";
import UserReadOnlyListView from "../../_components/UserReadOnlyListView";
import BackBar from "../../_components/BackBar";
import { auth } from "../../../auth";
import { getUserProfileData, getUserReviewStats, getReviewsByUser } from "../../_lib/review-data";
import { getMyRatedMovies } from "../../_lib/my-rated-movies";
import { checkIsFollowing, getFollowerCount } from "../../_lib/follow-actions";
import { notFound } from "next/navigation";

export default async function UserProfilePage({ params }: PageProps<"/users/[id]">) {
  const { id } = await params;

  const [session, profileUser, movies, followerCount, reviewStats, userReviews] = await Promise.all([
    auth(),
    getUserProfileData(id),
    getMyRatedMovies(id),
    getFollowerCount(id),
    getUserReviewStats(id),
    getReviewsByUser(id),
  ]);

  if (!profileUser) notFound();

  const currentUserId = session?.user?.id ?? null;
  const isOwnProfile = currentUserId === id;
  const isFollowing = isOwnProfile ? false : await checkIsFollowing(id);
  const displayName = profileUser.nickname ?? profileUser.name ?? "사용자";

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
      <UserReadOnlyListView movies={movies} userName={displayName} reviewStats={reviewStats} userReviews={userReviews} />
    </main>
  );
}
