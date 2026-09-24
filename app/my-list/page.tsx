import { redirect } from "next/navigation";
import SiteHeader from "../_components/SiteHeader";
import MyListView from "../_components/MyListView";
import { auth } from "../../auth";
import { db } from "../_lib/db";
import { getMyRatedMovies, getMyReviewsForSync } from "../_lib/my-rated-movies";
import { getFollowerCount, getFollowingList } from "../_lib/follow-actions";
import { getProfileViews } from "../_lib/profile-view-actions";

export default async function MyListPage() {
  const session = await auth();
  const userId = session?.user?.id;

  // 비로그인 사용자는 데이터를 조회하기 전에 로그인 페이지로 리다이렉트한다.
  if (!userId) {
    redirect("/login?callbackUrl=/my-list");
  }

  const [myRatedMovies, serverReviews, followerCount, followingList, profileViews, userRow] = await Promise.all([
    getMyRatedMovies(userId),
    getMyReviewsForSync(userId),
    getFollowerCount(userId),
    getFollowingList(userId),
    getProfileViews(userId),
    db.user.findUnique({ where: { id: userId }, select: { totalLikes: true } }),
  ]);

  return (
    <main>
      <SiteHeader active="my-list" />
      <MyListView
        myRatedMovies={myRatedMovies}
        serverReviews={serverReviews}
        followerCount={followerCount}
        followingList={followingList}
        profileViews={profileViews}
        userId={userId}
        totalLikes={userRow?.totalLikes ?? 0}
      />
    </main>
  );
}
