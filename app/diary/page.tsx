import SiteHeader from "../_components/SiteHeader";
import MovieDiaryCalendar from "../_components/MovieDiaryCalendar";
import { auth } from "../../auth";
import { getMyRatedMovies } from "../_lib/my-rated-movies";

export default async function DiaryPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const myRatedMovies = userId ? await getMyRatedMovies(userId) : [];

  return (
    <main>
      <SiteHeader active="my-list" />
      <MovieDiaryCalendar reviews={[]} serverRatedMovies={myRatedMovies} />
    </main>
  );
}
