import SiteHeader from "../_components/SiteHeader";
import MyListView from "../_components/MyListView";
import { auth } from "../../auth";
import { getMyRatedMovies, getMyReviewsForSync } from "../_lib/my-rated-movies";
import { getFollowerCount, getFollowingList } from "../_lib/follow-actions";

export default async function CollectionPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const [myRatedMovies, serverReviews, followerCount, followingList] = await Promise.all([
    userId ? getMyRatedMovies(userId) : Promise.resolve([]),
    userId ? getMyReviewsForSync(userId) : Promise.resolve(null),
    userId ? getFollowerCount(userId) : Promise.resolve(0),
    userId ? getFollowingList(userId) : Promise.resolve([]),
  ]);

  return (
    <main>
      <SiteHeader active="my-list" />
      <MyListView
        myRatedMovies={myRatedMovies}
        serverReviews={serverReviews}
        followerCount={followerCount}
        followingList={followingList}
        showCalendar={false}
        userId={userId ?? null}
      />
    </main>
  );
}
