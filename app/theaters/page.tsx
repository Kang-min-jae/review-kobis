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
              + 버튼으로 자주 가는 극장을 즐겨찾기해두면, 그 극장에서 이 영화를 상영할 때 바로 예매로 연결돼요.
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
