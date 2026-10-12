import type { Metadata } from "next";
import SiteHeader from "../../_components/SiteHeader";
import UserProfileView from "../../_components/UserProfileView";
import UserReadOnlyListView from "../../_components/UserReadOnlyListView";
import BackBar from "../../_components/BackBar";
import { auth } from "../../../auth";
import { getUserProfileData, getUserReviewStats, getReviewsByUser } from "../../_lib/review-data";
import { getMyRatedMovies } from "../../_lib/my-rated-movies";
import { checkIsFollowing, getFollowerCount } from "../../_lib/follow-actions";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: PageProps<"/users/[id]">): Promise<Metadata> {
  const { id } = await params;
  const profileUser = await getUserProfileData(id);
  if (!profileUser) return {};
  const name = profileUser.nickname ?? profileUser.name ?? "사용자";
  const title = `${name}님의 영화 리스트`;
  const description = `${name}님이 평점을 남긴 영화 목록과 리뷰를 확인하세요.`;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
  };
}

export default async function UserProfilePage({ params }: PageProps<"/users/[id]">) {
  const { id } = await params;

  // 리뷰 목록은 보는 사람이 작성자 본인인지에 따라 스포일러 본문을 가릴지가 달라 세션을 먼저 확인한다.
  const sessionPromise = auth();
  const [session, profileUser, movies, followerCount, reviewStats, userReviews] = await Promise.all([
    sessionPromise,
    getUserProfileData(id),
    getMyRatedMovies(id, { includeCategoryOnly: true }),
    getFollowerCount(id),
    getUserReviewStats(id),
    sessionPromise.then((s) => getReviewsByUser(id, s?.user?.id ?? null)),
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
        totalLikes={profileUser.totalLikes}
        followerCount={followerCount}
        isFollowing={isFollowing}
        isOwnProfile={isOwnProfile}
      />
      <UserReadOnlyListView
        movies={movies}
        userName={displayName}
        reviewStats={reviewStats}
        userReviews={userReviews}
        isAdmin={session?.user?.role === "ADMIN"}
        profileUserId={id}
      />
    </main>
  );
}
