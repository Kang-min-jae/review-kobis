import SearchBar from "./_components/SearchBar";
import CategoryNav, {
  tabCategories,
  genreLabels,
  type TabCategory,
  type GenreLabel,
} from "./_components/CategoryNav";
import MovieRow from "./_components/MovieRow";
import RecommendedSection from "./_components/RecommendedSection";
import {
  getNowShowing,
  getRereleases,
  resolveLocalMovieCards,
  getLocalNowShowingByMovieCd,
  applyNowShowingOverrides,
  getRecentMoviesRow,
  getMonthlyBestRow,
  getYearlyBestRow,
  getBestOf3YearsRow,
  getBestOf5YearsRow,
  getAllTimeBestRow,
  getInternationalBestRow,
  getWeeklyBoxOfficeRow,
  getGenreRow,
  type RowMovie,
} from "./_lib/movie-rows";

function resolveCategory(value: string | undefined): TabCategory {
  return (tabCategories as readonly string[]).includes(value ?? "")
    ? (value as TabCategory)
    : "영화";
}

function resolveGenre(value: string | undefined): GenreLabel {
  return (genreLabels as readonly string[]).includes(value ?? "") ? (value as GenreLabel) : "전체";
}

async function NowShowingSection() {
  const [nowShowing, rereleases] = await Promise.all([
    resolveLocalMovieCards(getNowShowing()),
    resolveLocalMovieCards(getRereleases()),
  ]);

  return (
    <>
      <MovieRow title="현재 상영중인 영화" subtitle="이번 주 새로 개봉한 영화" movies={nowShowing} />
      <MovieRow title="재개봉 영화" subtitle="다시 스크린에서 만나는 영화" movies={rereleases} />
    </>
  );
}

async function MovieCategorySection() {
  const [weeklyBoxOffice, recent, monthly, yearly, best3, best5, allTime, international, nowShowingMap] =
    await Promise.all([
      getWeeklyBoxOfficeRow(),
      getRecentMoviesRow(),
      getMonthlyBestRow(),
      getYearlyBestRow(),
      getBestOf3YearsRow(),
      getBestOf5YearsRow(),
      getAllTimeBestRow(),
      getInternationalBestRow(),
      getLocalNowShowingByMovieCd(),
    ]);

  const withBooking = (movies: RowMovie[]) => applyNowShowingOverrides(movies, nowShowingMap);

  return (
    <>
      <RecommendedSection />
      <MovieRow
        title="이번주 박스오피스 TOP 10"
        subtitle="국내 실제 관객수 기준 (KOFIC 영화진흥위원회)"
        movies={withBooking(weeklyBoxOffice)}
      />
      <MovieRow title="최근 영화" subtitle="올해 국내 개봉한 최신 영화" movies={withBooking(recent)} />
      <MovieRow
        title="이 달의 Best"
        subtitle="이번 달 국내 개봉한 최신 영화"
        movies={withBooking(monthly)}
      />
      <MovieRow
        title="올해의 Best"
        subtitle="올해 국내 개봉한 최신 영화"
        movies={withBooking(yearly)}
      />
      <MovieRow
        title="3년 Best"
        subtitle="최근 3년간 국내 개봉한 최신 영화"
        movies={withBooking(best3)}
      />
      <MovieRow
        title="5년 Best"
        subtitle="최근 5년간 국내 개봉한 최신 영화"
        movies={withBooking(best5)}
      />
      <MovieRow title="역대 Best" subtitle="국내 개봉한 최신 영화" movies={withBooking(allTime)} />
      <MovieRow
        title="해외 Best"
        subtitle="국내 개봉한 해외 영화 중 최신순"
        movies={withBooking(international)}
      />
    </>
  );
}

async function GenreSection({ genre }: { genre: GenreLabel }) {
  const [movies, nowShowingMap] = await Promise.all([
    getGenreRow(genre),
    getLocalNowShowingByMovieCd(),
  ]);
  return (
    <MovieRow title={`${genre} 영화`} movies={applyNowShowingOverrides(movies, nowShowingMap)} />
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const category = resolveCategory(
    typeof params.category === "string" ? params.category : undefined
  );
  const genre = resolveGenre(typeof params.genre === "string" ? params.genre : undefined);

  return (
    <main>
      <SearchBar />
      <CategoryNav active={category} activeGenre={genre} />

      {category === "현재 상영중인 영화" && <NowShowingSection />}

      {category === "영화" && genre === "전체" && <MovieCategorySection />}
      {category === "영화" && genre !== "전체" && <GenreSection genre={genre} />}

      {(category === "TV프로그램" || category === "단편·독립") && (
        <p className="px-5 py-16 text-center text-sm text-muted">준비 중인 카테고리예요.</p>
      )}
    </main>
  );
}
