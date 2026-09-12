import SiteHeader from "../_components/SiteHeader";
import MyListView from "../_components/MyListView";
import { auth } from "../../auth";
import { getMyRatedMovies } from "../_lib/my-rated-movies";
import { getFollowerCount, getFollowingList } from "../_lib/follow-actions";
import { getProfileViews } from "../_lib/profile-view-actions";

export default async function MyListPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const [myRatedMovies, followerCount, followingList, profileViews] = await Promise.all([
    userId ? getMyRatedMovies(userId) : Promise.resolve([]),
    userId ? getFollowerCount(userId) : Promise.resolve(0),
    userId ? getFollowingList(userId) : Promise.resolve([]),
    userId ? getProfileViews(userId) : Promise.resolve({ today: 0, total: 0 }),
  ]);

  return (
    <main>
      <SiteHeader active="my-list" />
      <MyListView
        myRatedMovies={myRatedMovies}
        followerCount={followerCount}
        followingList={followingList}
        profileViews={profileViews}
      />
    </main>
  );
}
