import { Suspense } from "react";
import SiteHeader from "./_components/SiteHeader";
import {
  tabCategories,
  genreLabels,
  type TabCategory,
  type GenreLabel,
} from "./_components/CategoryNav";
import MovieRow from "./_components/MovieRow";
import GenreMovieRow from "./_components/GenreMovieRow";
import BoxOfficeCoverflow from "./_components/BoxOfficeCoverflow";
import RatingSortedMovieRow from "./_components/RatingSortedMovieRow";
import RecommendedSection from "./_components/RecommendedSection";
import RecommendedSeriesSection from "./_components/RecommendedSeriesSection";
import AwardWinnersSection, { type AwardTab } from "./_components/AwardWinnersSection";
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
  getUserPopularMoviesRow,
} from "./_lib/movie-rows";
import {
  getLatestAcademyWinnerRows,
  getLatestCannesWinnerRows,
  getLatestBerlinWinnerRows,
  getLatestVeniceWinnerRows,
} from "./_lib/award-winners";
import { getCuratedSeriesRow, getPopularSeriesRow, getTop10PopularSeriesRow } from "./_lib/series-rows";
import SeriesKeywordSearch from "./_components/SeriesKeywordSearch";
import CoverflowCarousel from "./_components/CoverflowCarousel";
import RowSkeleton from "./_components/RowSkeleton";

function resolveCategory(value: string | undefined): TabCategory {
  return (tabCategories as readonly string[]).includes(value ?? "")
    ? (value as TabCategory)
    : "영화";
}

function resolveGenre(value: string | undefined): GenreLabel {
  return (genreLabels as readonly string[]).includes(value ?? "") ? (value as GenreLabel) : "전체";
}

async function NowShowingRowData() {
  const movies = await getNowShowingRow();
  return <MovieRow title="현재 상영중인 영화" subtitle="현재 박스오피스에서 상영 중인 영화" movies={movies} priorityCount={3} />;
}

async function RereleaseRowData() {
  const movies = await getRereleaseRow();
  return <MovieRow title="재개봉 영화" subtitle="다시 스크린에서 만나는 영화" movies={movies} priorityCount={3} />;
}

async function WeeklyBoxOfficeRowData2() {
  const movies = await getWeeklyBoxOfficeRow();
  return <MovieRow title="이번주 박스오피스 TOP 10" subtitle="국내 실제 관객수 기준" movies={movies} priorityCount={3} />;
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
        <WeeklyBoxOfficeRowData2 />
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
  return <MovieRow title="최근 영화" subtitle="최근 3달 이내 국내 개봉한 영화" movies={movies} priorityCount={3} />;
}

async function MonthlyBestRowData() {
  const movies = await getMonthlyBestRow();
  return <MovieRow title="이 달의 Best" subtitle="이번 달 국내 누적 관객수 기준" movies={movies} />;
}

function BestRowEmpty({ title }: { title: string }) {
  return (
    <section className="px-4 py-5 sm:px-5 sm:py-6">
      <h2 className="text-lg font-bold text-text">{title}</h2>
      <p className="mt-2 text-sm text-muted">데이터를 집계하는 중입니다. 잠시 후 새로고침해 주세요.</p>
    </section>
  );
}

async function YearlyBestRowData() {
  const movies = await getYearlyBestRow();
  if (movies.length === 0) return <BestRowEmpty title="올해의 Best" />;
  return (
    <MovieRow
      title="올해의 Best"
      subtitle="올해 개봉작 · 평점 높은 순 10편 (동점이면 참여 평점 수가 많은 순)"
      movies={movies}
    />
  );
}

async function Best3YearsRowData() {
  const movies = await getBestOf3YearsRow();
  if (movies.length === 0) return <BestRowEmpty title="3년 Best" />;
  return (
    <MovieRow
      title="3년 Best"
      subtitle="최근 3년 개봉작 · 평점 높은 순 15편 (동점이면 참여 평점 수가 많은 순)"
      movies={movies}
    />
  );
}

async function Best5YearsRowData() {
  const movies = await getBestOf5YearsRow();
  if (movies.length === 0) return <BestRowEmpty title="5년 Best" />;
  return (
    <MovieRow
      title="5년 Best"
      subtitle="최근 5년 개봉작 · 평점 높은 순 20편 (동점이면 참여 평점 수가 많은 순)"
      movies={movies}
    />
  );
}

async function AllTimeBestRowData() {
  const movies = await getAllTimeBestRow();
  if (movies.length === 0) return <BestRowEmpty title="역대 Best" />;
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
  if (movies.length === 0) return <BestRowEmpty title="해외 Best" />;
  return (
    <RatingSortedMovieRow
      title="해외 Best"
      subtitle="국내 개봉한 해외 영화 · 평점 높은 순 (동점이면 참여 평점 수가 많은 순)"
      movies={movies}
    />
  );
}


async function UserPopularMoviesRowData({ genre }: { genre?: string }) {
  const movies = await getUserPopularMoviesRow(genre, 10);
  if (movies.length < 3) return null; // 평점 데이터가 충분하지 않으면 행 숨김
  return (
    <MovieRow
      title="사용자 인기영화"
      subtitle={genre ? `${genre} 장르 중 평점이 가장 많은 순` : "이 사이트에서 평점을 가장 많이 받은 영화"}
      movies={movies}
    />
  );
}

async function AwardWinnersData() {
  const [academyRows, cannesRows, berlinRows, veniceRows] = await Promise.all([
    getLatestAcademyWinnerRows(),
    getLatestCannesWinnerRows(),
    getLatestBerlinWinnerRows(),
    getLatestVeniceWinnerRows(),
  ]);

  const tabs: AwardTab[] = [
    {
      id: "academy",
      name: "아카데미 시상식",
      icon: "trophy",
      movies: academyRows.map((r) => r.movie),
    },
    {
      id: "cannes",
      name: "칸 영화제",
      icon: "star",
      movies: cannesRows.map((r) => r.movie),
    },
    {
      id: "berlin",
      name: "베를린 영화제",
      icon: "star",
      movies: berlinRows.map((r) => r.movie),
    },
    {
      id: "venice",
      name: "베니스 영화제",
      icon: "star",
      movies: veniceRows.map((r) => r.movie),
    },
  ].filter((tab) => tab.movies.length > 0) as AwardTab[];

  if (tabs.length === 0) return null;
  return <AwardWinnersSection tabs={tabs} />;
}

function MovieCategorySection() {
  return (
    <>
      <Suspense fallback={<RowSkeleton />}>
        <WeeklyBoxOfficeRowData />
      </Suspense>
      <Suspense fallback={<RowSkeleton />}>
        <RecommendedSection />
      </Suspense>
      <Suspense fallback={<RowSkeleton />}>
        <AwardWinnersData />
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
      <Suspense fallback={<RowSkeleton />}>
        <RecommendedSeriesSection />
      </Suspense>
      <Suspense fallback={null}>
        <UserPopularMoviesRowData />
      </Suspense>
    </>
  );
}

async function CuratedSeriesSection() {
  const movies = await getCuratedSeriesRow();
  if (movies.length === 0) return null;
  return <MovieRow title="추천 시리즈물" subtitle="사용자 평점순" movies={movies} />;
}

async function PopularSeriesSection() {
  const movies = await getPopularSeriesRow();
  if (movies.length === 0) return null;
  return <MovieRow title="Best 시리즈물" subtitle="사용자 평점 높은 순" movies={movies} />;
}

async function Top10SeriesData() {
  const movies = await getTop10PopularSeriesRow();
  if (movies.length === 0) return null;
  return <CoverflowCarousel movies={movies} hint="카드를 드래그하거나 화살표로 넘겨보세요" />;
}

function TvSeriesSection() {
  return (
    <>
      <Suspense fallback={<RowSkeleton />}>
        <CuratedSeriesSection />
      </Suspense>
      <section className="px-5 py-6">
        <h2 className="text-lg font-bold text-text">키워드로 찾기</h2>
        <p className="mt-1 text-sm text-muted">장르, 배우 이름, 시리즈 제목으로 바로 검색하세요</p>
        <SeriesKeywordSearch />
      </section>
      <section className="px-5 pb-2 pt-4">
        <h2 className="text-lg font-bold text-text">인기 작품 10선</h2>
        <p className="mt-1 text-sm text-muted">사용자 평점 등록 많은 순</p>
        <Suspense fallback={
          <div className="mt-6 flex gap-4 overflow-x-auto pb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="aspect-2/3 w-28 shrink-0 animate-pulse rounded-lg bg-neutral-800" />
            ))}
          </div>
        }>
          <Top10SeriesData />
        </Suspense>
      </section>
      <Suspense fallback={<RowSkeleton />}>
        <PopularSeriesSection />
      </Suspense>
    </>
  );
}

async function GenreRowData({ genre }: { genre: GenreLabel }) {
  const movies = await getGenreRow(genre, 0, 20);
  return <GenreMovieRow genre={genre} initialMovies={movies} />;
}

function GenreSection({ genre }: { genre: GenreLabel }) {
  return (
    <>
      <Suspense key={genre} fallback={<RowSkeleton />}>
        <GenreRowData genre={genre} />
      </Suspense>
      <Suspense fallback={null}>
        <UserPopularMoviesRowData genre={genre} />
      </Suspense>
    </>
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

      {category === "TV·시리즈물" && <TvSeriesSection />}

    </main>
  );
}
