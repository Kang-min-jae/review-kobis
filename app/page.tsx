<<<<<<< HEAD
import SiteHeader from "./_components/SiteHeader";
import {
=======
import SearchBar from "./_components/SearchBar";
import CategoryNav, {
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914
  tabCategories,
  genreLabels,
  type TabCategory,
  type GenreLabel,
} from "./_components/CategoryNav";
import MovieRow from "./_components/MovieRow";
<<<<<<< HEAD
import RatingSortedMovieRow from "./_components/RatingSortedMovieRow";
import RecommendedSection from "./_components/RecommendedSection";
import {
  getNowShowingRow,
  getRereleaseRow,
  getRereleaseCategoryRows,
=======
import RecommendedSection from "./_components/RecommendedSection";
import {
  getNowShowing,
  getRereleases,
  resolveLocalMovieCards,
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914
  getRecentMoviesRow,
  getMonthlyBestRow,
  getYearlyBestRow,
  getBestOf3YearsRow,
  getBestOf5YearsRow,
  getAllTimeBestRow,
<<<<<<< HEAD
  getInternationalBestRow,
  getWeeklyBoxOfficeRow,
=======
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914
  getGenreRow,
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
<<<<<<< HEAD
  const [nowShowing, rereleases] = await Promise.all([getNowShowingRow(), getRereleaseRow()]);
=======
  const [nowShowing, rereleases] = await Promise.all([
    resolveLocalMovieCards(getNowShowing()),
    resolveLocalMovieCards(getRereleases()),
  ]);
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914

  return (
    <>
      <MovieRow title="현재 상영중인 영화" subtitle="이번 주 새로 개봉한 영화" movies={nowShowing} />
      <MovieRow title="재개봉 영화" subtitle="다시 스크린에서 만나는 영화" movies={rereleases} />
    </>
  );
}

<<<<<<< HEAD
async function RereleaseSection() {
  const groups = await getRereleaseCategoryRows();
  return (
    <>
      {groups.map((group) => (
        <MovieRow key={group.label} title={group.label} movies={group.movies} />
      ))}
    </>
  );
}

async function MovieCategorySection() {
  const [weeklyBoxOffice, recent, monthly, yearly, best3, best5, allTime, international] =
    await Promise.all([
      getWeeklyBoxOfficeRow(),
      getRecentMoviesRow(),
      getMonthlyBestRow(),
      getYearlyBestRow(),
      getBestOf3YearsRow(),
      getBestOf5YearsRow(),
      getAllTimeBestRow(),
      getInternationalBestRow(),
    ]);
=======
async function MovieCategorySection() {
  const [recent, monthly, yearly, best3, best5, allTime] = await Promise.all([
    getRecentMoviesRow(),
    getMonthlyBestRow(),
    getYearlyBestRow(),
    getBestOf3YearsRow(),
    getBestOf5YearsRow(),
    getAllTimeBestRow(),
  ]);
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914

  return (
    <>
      <RecommendedSection />
<<<<<<< HEAD
      <MovieRow
        title="이번주 박스오피스 TOP 10"
        subtitle="국내 실제 관객수 기준 (KOFIC 영화진흥위원회)"
        movies={weeklyBoxOffice}
      />
      <MovieRow title="최근 영화" subtitle="올해 국내 개봉한 최신 영화" movies={recent} />
      <MovieRow
        title="이 달의 Best"
        subtitle="이번 달 국내 누적 관객수 기준"
        movies={monthly}
      />
      <RatingSortedMovieRow
        title="올해의 Best"
        subtitle="평점 높은 순 (동점이면 참여 평점 수가 많은 순)"
        movies={yearly}
      />
      <RatingSortedMovieRow
        title="3년 Best"
        subtitle="평점 높은 순 (동점이면 참여 평점 수가 많은 순)"
        movies={best3}
      />
      <RatingSortedMovieRow
        title="5년 Best"
        subtitle="평점 높은 순 (동점이면 참여 평점 수가 많은 순)"
        movies={best5}
      />
      <RatingSortedMovieRow
        title="역대 Best"
        subtitle="평점 높은 순 (동점이면 참여 평점 수가 많은 순)"
        movies={allTime}
      />
      <RatingSortedMovieRow
        title="해외 Best"
        subtitle="국내 개봉한 해외 영화 · 평점 높은 순 (동점이면 참여 평점 수가 많은 순)"
        movies={international}
      />
=======
      <MovieRow title="최근 영화" subtitle="올해 인기 있었던 영화" movies={recent} />
      <MovieRow title="이 달의 Best" subtitle="이번 달 가장 인기 있는 영화" movies={monthly} />
      <MovieRow title="올해의 Best" subtitle="올해 가장 인기 있었던 영화" movies={yearly} />
      <MovieRow title="3년 Best" subtitle="최근 3년간 평가가 좋았던 영화" movies={best3} />
      <MovieRow title="5년 Best" subtitle="최근 5년간 평가가 좋았던 영화" movies={best5} />
      <MovieRow title="역대 Best" subtitle="역대 평가가 좋은 영화" movies={allTime} />
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914
    </>
  );
}

async function GenreSection({ genre }: { genre: GenreLabel }) {
  const movies = await getGenreRow(genre);
  return <MovieRow title={`${genre} 영화`} movies={movies} />;
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const category = resolveCategory(
    typeof params.category === "string" ? params.category : undefined
  );
  const genre = resolveGenre(typeof params.genre === "string" ? params.genre : undefined);

  return (
    <main>
<<<<<<< HEAD
      <SiteHeader active={category} activeGenre={genre} />

      {category === "현재 상영중인 영화" && <NowShowingSection />}
      {category === "재개봉작" && <RereleaseSection />}
=======
      <SearchBar />
      <CategoryNav active={category} activeGenre={genre} />

      {category === "현재 상영중인 영화" && <NowShowingSection />}
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914

      {category === "영화" && genre === "전체" && <MovieCategorySection />}
      {category === "영화" && genre !== "전체" && <GenreSection genre={genre} />}

      {(category === "TV프로그램" || category === "단편·독립") && (
        <p className="px-5 py-16 text-center text-sm text-muted">준비 중인 카테고리예요.</p>
      )}
    </main>
  );
}
