import SearchBar from "./_components/SearchBar";
import CategoryNav, { tabCategories, type TabCategory } from "./_components/CategoryNav";
import MovieRow from "./_components/MovieRow";
import {
  getNowShowing,
  getRereleases,
  getRecommended,
  getRecentMovies,
  getMonthlyBest,
  getYearlyBest,
  getBestOf3Years,
  getBestOf5Years,
  getAllTimeBest,
} from "./_lib/movie-rows";

function resolveCategory(value: string | undefined): TabCategory {
  return (tabCategories as readonly string[]).includes(value ?? "")
    ? (value as TabCategory)
    : "영화";
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

      {category === "현재 상영중인 영화" && (
        <>
          <MovieRow title="현재 상영중인 영화" subtitle="이번 주 새로 개봉한 영화" movies={getNowShowing()} />
          <MovieRow title="재개봉 영화" subtitle="다시 스크린에서 만나는 영화" movies={getRereleases()} />
        </>
      )}

      {category === "영화" && (
        <>
          <MovieRow title="사용자 추천 영화" subtitle="회원님이 좋아할 만한 영화" movies={getRecommended()} />
          <MovieRow title="최근 영화" movies={getRecentMovies()} />
          <MovieRow title="이 달의 Best" movies={getMonthlyBest()} />
          <MovieRow title="올해의 Best" movies={getYearlyBest()} />
          <MovieRow title="3년 Best" movies={getBestOf3Years()} />
          <MovieRow title="5년 Best" movies={getBestOf5Years()} />
          <MovieRow title="역대 Best" movies={getAllTimeBest()} />
        </>
      )}

      {(category === "TV프로그램" || category === "단편·독립") && (
        <p className="px-5 py-16 text-center text-sm text-muted">준비 중인 카테고리예요.</p>
      )}
    </main>
  );
}
