import SiteHeader from "../_components/SiteHeader";
import MyListView from "../_components/MyListView";
import { auth } from "../../auth";
import { getMyRatedMovies } from "../_lib/my-rated-movies";
import { getFollowerCount, getFollowingList } from "../_lib/follow-actions";

export default async function MyListPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const [myRatedMovies, followerCount, followingList] = await Promise.all([
    userId ? getMyRatedMovies(userId) : Promise.resolve([]),
    userId ? getFollowerCount(userId) : Promise.resolve(0),
    userId ? getFollowingList(userId) : Promise.resolve([]),
  ]);

  return (
    <main>
      <SiteHeader active="my-list" />
      <MyListView myRatedMovies={myRatedMovies} followerCount={followerCount} followingList={followingList} />
    </main>
  );
}
