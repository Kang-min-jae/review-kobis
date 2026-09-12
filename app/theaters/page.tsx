import { getNowShowingRow, getRereleaseRow } from "../_lib/movie-rows";
import { getNationwideTheaters } from "../_lib/mock-theaters";
import MovieTheaterFavorites from "../_components/MovieTheaterFavorites";
import TheaterBrowser from "../_components/TheaterBrowser";
import SiteHeader from "../_components/SiteHeader";
import BackBar from "../_components/BackBar";

export default async function TheatersPage({ searchParams }: PageProps<"/theaters">) {
  const { movie: movieId } = await searchParams;
  const [nowShowing, rereleases] = await Promise.all([getNowShowingRow(20), getRereleaseRow(20)]);
  const inTheaters = [...nowShowing, ...rereleases];
  const movie = inTheaters.find((m) => m.id === movieId);
  const theaters = getNationwideTheaters(inTheaters);

  return (
    <main>
      <SiteHeader />
      <div className="px-5 py-6">
        <BackBar />

        <h1 className="mt-3 text-lg font-bold text-text">
          {movie ? `${movie.title} 예매하기` : "전국 영화관"}
        </h1>

        {movie ? (
          <>
            <p className="mt-1 text-sm text-muted">
              각 극장 홈페이지로 이동해 예매하세요.
            </p>
            <div className="mt-6">
              <MovieTheaterFavorites movieId={movie.id} theaters={theaters} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">상영 중인 극장을 확인해 보세요.</p>
            <TheaterBrowser theaters={theaters} />
          </>
        )}
      </div>
    </main>
  );
}
