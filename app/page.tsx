import { Suspense } from "react";
import SiteHeader from "./_components/SiteHeader";
import {
  tabCategories,
  genreLabels,
  type TabCategory,
  type GenreLabel,
} from "./_components/CategoryNav";
import MovieRow from "./_components/MovieRow";
import BoxOfficeCoverflow from "./_components/BoxOfficeCoverflow";
import RatingSortedMovieRow from "./_components/RatingSortedMovieRow";
import RecommendedSection from "./_components/RecommendedSection";
import {
  getNowShowingRow,
  getRereleaseRow,
  getRecentMoviesRow,
  getMonthlyBestRow,
  getYearlyBestRow,
  getBestOf3YearsRow,
  getBestOf5YearsRow,
  getAllTimeBestRow,
  getInternationalBestRow,
  getWeeklyBoxOfficeRow,
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

// 각 행이 자기 데이터를 다 가져올 때까지 화면 전체가 하얗게 멈춰 있지 않도록, 행마다
// 이 스켈레톤을 보여주다가 준비되는 대로 하나씩 바로 교체되게 한다(Suspense 스트리밍).
function RowSkeleton() {
  return (
    <section className="px-5 py-6">
      <div className="h-5 w-32 animate-pulse rounded bg-neutral-800" />
      <div className="row-scrollbar mt-4 flex gap-4 overflow-x-auto pb-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-2/3 w-32 shrink-0 animate-pulse rounded-lg bg-neutral-800" />
        ))}
      </div>
    </section>
  );
}

async function NowShowingRowData() {
  const movies = await getNowShowingRow();
  return <MovieRow title="현재 상영중인 영화" subtitle="이번 주 새로 개봉한 영화" movies={movies} />;
}

async function RereleaseRowData() {
  const movies = await getRereleaseRow();
  return <MovieRow title="재개봉 영화" subtitle="다시 스크린에서 만나는 영화" movies={movies} />;
}

// 홈 화면 기본 탭이 예전엔 이 아래 8개 행 전부를 Promise.all로 한 번에 불러온 뒤에야
// 화면을 그렸는데, 캐시가 비어 있는 첫 방문엔 영화 수십~백 편의 메타데이터를 한꺼번에
// 기다려야 해서 그동안 화면이 통째로 멈춰 있는 것처럼 보였다(게다가 KMDb에 몰린
// 동시 요청이 소켓 오류까지 냈었다). 행마다 독립된 Suspense 경계로 감싸면, 준비된
// 행은 그 즉시 화면에 스트리밍되고 아직 안 끝난 행만 스켈레톤으로 남는다.
function NowShowingSection() {
  return (
    <>
      <Suspense fallback={<RowSkeleton />}>
        <NowShowingRowData />
      </Suspense>
      <Suspense fallback={<RowSkeleton />}>
        <RereleaseRowData />
      </Suspense>
    </>
  );
}

async function WeeklyBoxOfficeRowData() {
  const movies = await getWeeklyBoxOfficeRow();
  return (
    <BoxOfficeCoverflow title="이번주 박스오피스 TOP 10" subtitle="국내 실제 관객수 기준" movies={movies} />
  );
}

async function RecentMoviesRowData() {
  const movies = await getRecentMoviesRow();
  return <MovieRow title="최근 영화" subtitle="올해 국내 개봉한 최신 영화" movies={movies} />;
}

async function MonthlyBestRowData() {
  const movies = await getMonthlyBestRow();
  return <MovieRow title="이 달의 Best" subtitle="이번 달 국내 누적 관객수 기준" movies={movies} />;
}

async function YearlyBestRowData() {
  const movies = await getYearlyBestRow();
  return (
    <RatingSortedMovieRow
      title="올해의 Best"
      subtitle="평점 높은 순 (동점이면 참여 평점 수가 많은 순)"
      movies={movies}
    />
  );
}

async function Best3YearsRowData() {
  const movies = await getBestOf3YearsRow();
  return (
    <RatingSortedMovieRow
      title="3년 Best"
      subtitle="평점 높은 순 (동점이면 참여 평점 수가 많은 순)"
      movies={movies}
    />
  );
}

async function Best5YearsRowData() {
  const movies = await getBestOf5YearsRow();
  return (
    <RatingSortedMovieRow
      title="5년 Best"
      subtitle="평점 높은 순 (동점이면 참여 평점 수가 많은 순)"
      movies={movies}
    />
  );
}

async function AllTimeBestRowData() {
  const movies = await getAllTimeBestRow();
  return (
    <RatingSortedMovieRow
      title="역대 Best"
      subtitle="평점 높은 순 (동점이면 참여 평점 수가 많은 순)"
      movies={movies}
    />
  );
}

async function InternationalBestRowData() {
  const movies = await getInternationalBestRow();
  return (
    <RatingSortedMovieRow
      title="해외 Best"
      subtitle="국내 개봉한 해외 영화 · 평점 높은 순 (동점이면 참여 평점 수가 많은 순)"
      movies={movies}
    />
  );
}

function MovieCategorySection() {
  return (
    <>
      <RecommendedSection />
      <Suspense fallback={<RowSkeleton />}>
        <WeeklyBoxOfficeRowData />
      </Suspense>
      <Suspense fallback={<RowSkeleton />}>
        <RecentMoviesRowData />
      </Suspense>
      <Suspense fallback={<RowSkeleton />}>
        <MonthlyBestRowData />
      </Suspense>
      <Suspense fallback={<RowSkeleton />}>
        <YearlyBestRowData />
      </Suspense>
      <Suspense fallback={<RowSkeleton />}>
        <Best3YearsRowData />
      </Suspense>
      <Suspense fallback={<RowSkeleton />}>
        <Best5YearsRowData />
      </Suspense>
      <Suspense fallback={<RowSkeleton />}>
        <AllTimeBestRowData />
      </Suspense>
      <Suspense fallback={<RowSkeleton />}>
        <InternationalBestRowData />
      </Suspense>
    </>
  );
}

async function GenreRowData({ genre }: { genre: GenreLabel }) {
  const movies = await getGenreRow(genre);
  return <MovieRow title={`${genre} 영화`} movies={movies} />;
}

function GenreSection({ genre }: { genre: GenreLabel }) {
  return (
    <Suspense key={genre} fallback={<RowSkeleton />}>
      <GenreRowData genre={genre} />
    </Suspense>
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
      <SiteHeader active={category} activeGenre={genre} />

      {category === "현재 상영중인 영화" && <NowShowingSection />}

      {category === "영화" && genre === "전체" && <MovieCategorySection />}
      {category === "영화" && genre !== "전체" && <GenreSection genre={genre} />}

      {(category === "TV프로그램" || category === "단편·독립") && (
        <p className="px-5 py-16 text-center text-sm text-muted">준비 중인 카테고리예요.</p>
      )}
    </main>
  );
}
