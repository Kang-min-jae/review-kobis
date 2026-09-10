import SiteHeader from "../_components/SiteHeader";
import MyListView from "../_components/MyListView";
import { auth } from "../../auth";
import { getMyRatedMovies } from "../_lib/my-rated-movies";

export default async function MyListPage() {
  const session = await auth();
  const myRatedMovies = session?.user?.id ? await getMyRatedMovies(session.user.id) : [];

  return (
    <main>
      <SiteHeader active="my-list" />
      <MyListView myRatedMovies={myRatedMovies} />
    </main>
  );
}
