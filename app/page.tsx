import SearchBar from "./_components/SearchBar";
import CategoryNav, { tabCategories, type TabCategory } from "./_components/CategoryNav";
import MovieRow from "./_components/MovieRow";
import {
  getNowShowing,
  getRereleases,
  resolveLocalMovieCards,
  getRecommendedRow,
  getRecentMoviesRow,
  getMonthlyBestRow,
  getYearlyBestRow,
  getBestOf3YearsRow,
  getBestOf5YearsRow,
  getAllTimeBestRow,
} from "./_lib/movie-rows";

function resolveCategory(value: string | undefined): TabCategory {
  return (tabCategories as readonly string[]).includes(value ?? "")
    ? (value as TabCategory)
    : "영화";
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
  const [recommended, recent, monthly, yearly, best3, best5, allTime] = await Promise.all([
    getRecommendedRow(),
    getRecentMoviesRow(),
    getMonthlyBestRow(),
    getYearlyBestRow(),
    getBestOf3YearsRow(),
    getBestOf5YearsRow(),
    getAllTimeBestRow(),
  ]);

  return (
    <>
      <MovieRow title="사용자 추천 영화" subtitle="지금 화제가 되고 있는 영화" movies={recommended} />
      <MovieRow title="최근 영화" subtitle="올해 인기 있었던 영화" movies={recent} />
      <MovieRow title="이 달의 Best" subtitle="이번 달 가장 인기 있는 영화" movies={monthly} />
      <MovieRow title="올해의 Best" subtitle="올해 가장 인기 있었던 영화" movies={yearly} />
      <MovieRow title="3년 Best" subtitle="최근 3년간 평가가 좋았던 영화" movies={best3} />
      <MovieRow title="5년 Best" subtitle="최근 5년간 평가가 좋았던 영화" movies={best5} />
      <MovieRow title="역대 Best" subtitle="역대 평가가 좋은 영화" movies={allTime} />
    </>
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const category = resolveCategory(
    typeof params.category === "string" ? params.category : undefined
  );

  return (
    <main>
      <SearchBar />
      <CategoryNav active={category} />

      {category === "현재 상영중인 영화" && <NowShowingSection />}
      {category === "영화" && <MovieCategorySection />}

      {(category === "TV프로그램" || category === "단편·독립") && (
        <p className="px-5 py-16 text-center text-sm text-muted">준비 중인 카테고리예요.</p>
      )}
    </main>
  );
}
