import { Suspense } from "react";
import type { Metadata } from "next";
import { SITE_URL, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION, BASE_OPEN_GRAPH } from "../_lib/site";
import { resolveCategory, resolveGenre, type GenreLabel } from "../_components/CategoryNav";
import MovieRow from "../_components/MovieRow";
import GenreMovieRow from "../_components/GenreMovieRow";
import BoxOfficeCoverflow from "../_components/BoxOfficeCoverflow";
import RatingSortedMovieRow from "../_components/RatingSortedMovieRow";
import RecommendedSection from "../_components/RecommendedSection";
import RecommendedSeriesSection from "../_components/RecommendedSeriesSection";
import AwardWinnersSection, { type AwardTab } from "../_components/AwardWinnersSection";
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
  getGenrePopularRow,
  getGenreYearlyBestRow,
  getGenreAllTimeBestRow,
  getUserPopularMoviesRow,
} from "../_lib/movie-rows";
import {
  getLatestAcademyWinnerRows,
  getLatestCannesWinnerRows,
  getLatestBerlinWinnerRows,
  getLatestVeniceWinnerRows,
  ceremonyLabel,
} from "../_lib/award-winners";
import { getCuratedSeriesRow, getPopularSeriesRow, getTop10PopularSeriesRow } from "../_lib/series-rows";
import SeriesKeywordSearch from "../_components/SeriesKeywordSearch";
import CoverflowCarousel from "../_components/CoverflowCarousel";
import RowSkeleton from "../_components/RowSkeleton";
import HomeHero from "../_components/HomeHero";
import { getHeroLists } from "../_lib/home-hero";
import { auth } from "../../auth";
import { db } from "../_lib/db";
import { withFreshRatings } from "../_lib/fresh-ratings";
import type { RowMovie } from "../_lib/movie-rows";


// 행 하나의 데이터 조회가 throw하면 Suspense는 잡지 못하고 app/error.tsx까지 올라가
// 홈 화면 전체가 "오류"로 바뀐다. 실패한 행만 빈 배열로 숨기고 나머지는 그대로 보여준다.
// 행 카드의 평균 별점은 행 캐시와 따로 최신 값으로 덮어쓴다(fresh-ratings.ts) — 평점을 남기면 바로 반영된다.
async function safeMovieRows<T extends RowMovie>(label: string, load: () => Promise<T[]>): Promise<T[]> {
  return withFreshRatings(await safeRows(label, load));
}

async function safeRows<T>(label: string, load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch (error) {
    console.error(`[home] ${label} 행 로드 실패`, error);
    return [];
  }
}

async function NowShowingRowData() {
  const movies = await safeMovieRows("getNowShowingRow", getNowShowingRow);
  return <MovieRow title="현재 상영중인 영화" subtitle="현재 박스오피스에서 상영 중인 영화" movies={movies} priorityCount={3} />;
}

async function RereleaseRowData() {
  const movies = await safeMovieRows("getRereleaseRow", getRereleaseRow);
  return <MovieRow title="재개봉 영화" subtitle="다시 스크린에서 만나는 영화" movies={movies} priorityCount={3} />;
}

async function WeeklyBoxOfficeRowData2() {
  const movies = await safeMovieRows("getWeeklyBoxOfficeRow", getWeeklyBoxOfficeRow);
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
  const movies = await safeMovieRows("getWeeklyBoxOfficeRow", getWeeklyBoxOfficeRow);
  return (
    <BoxOfficeCoverflow title="이번주 박스오피스 TOP 10" subtitle="국내 실제 관객수 기준" movies={movies} />
  );
}

async function RecentMoviesRowData() {
  const movies = await safeMovieRows("getRecentMoviesRow", getRecentMoviesRow);
  return <MovieRow title="최근 영화" subtitle="최근 3달 이내 국내 개봉한 영화" movies={movies} priorityCount={3} />;
}

async function MonthlyBestRowData() {
  const movies = await safeMovieRows("getMonthlyBestRow", getMonthlyBestRow);
  return <MovieRow title="이 달의 Best" subtitle="이번 달 국내 누적 관객수 기준" movies={movies} />;
}

async function YearlyBestRowData() {
  const movies = await safeMovieRows("getYearlyBestRow", getYearlyBestRow);
  return (
    <MovieRow
      title="올해의 Best"
      subtitle="올해 개봉작 · 평점 높은 순 10편 (동점이면 참여 평점 수가 많은 순)"
      movies={movies}
    />
  );
}

async function Best3YearsRowData() {
  const movies = await safeMovieRows("getBestOf3YearsRow", getBestOf3YearsRow);
  return (
    <MovieRow
      title="3년 Best"
      subtitle="최근 3년 개봉작 · 평점 높은 순 15편 (동점이면 참여 평점 수가 많은 순)"
      movies={movies}
    />
  );
}

async function Best5YearsRowData() {
  const movies = await safeMovieRows("getBestOf5YearsRow", getBestOf5YearsRow);
  return (
    <MovieRow
      title="5년 Best"
      subtitle="최근 5년 개봉작 · 평점 높은 순 20편 (동점이면 참여 평점 수가 많은 순)"
      movies={movies}
    />
  );
}

async function AllTimeBestRowData() {
  const movies = await safeMovieRows("getAllTimeBestRow", getAllTimeBestRow);
  return (
    <RatingSortedMovieRow
      title="역대 Best"
      subtitle="평점 높은 순 (동점이면 참여 평점 수가 많은 순)"
      movies={movies}
    />
  );
}

async function InternationalBestRowData() {
  const movies = await safeMovieRows("getInternationalBestRow", getInternationalBestRow);
  return (
    <RatingSortedMovieRow
      title="해외 Best"
      subtitle="국내 개봉한 해외 영화 · 평점 높은 순 (동점이면 참여 평점 수가 많은 순)"
      movies={movies}
    />
  );
}


async function UserPopularMoviesRowData({ genre }: { genre?: string }) {
  const movies = await safeMovieRows("getUserPopularMoviesRow", () => getUserPopularMoviesRow(genre, 10));
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
  // 영화제 하나의 조회(Wikidata 등)가 실패해도 홈 전체가 오류 화면이 되지 않게, 그 영화제만 빈 탭으로 둔다.
  const [academyRows, cannesRows, berlinRows, veniceRows] = await Promise.all([
    safeRows("getLatestAcademyWinnerRows", getLatestAcademyWinnerRows),
    safeRows("getLatestCannesWinnerRows", getLatestCannesWinnerRows),
    safeRows("getLatestBerlinWinnerRows", getLatestBerlinWinnerRows),
    safeRows("getLatestVeniceWinnerRows", getLatestVeniceWinnerRows),
  ]);

  const [academy, cannes, berlin, venice] = await Promise.all(
    [academyRows, cannesRows, berlinRows, veniceRows].map((rows) => withFreshRatings(rows.map((r) => r.movie))),
  );

  const tabs: AwardTab[] = [
    {
      id: "academy",
      name: "아카데미 시상식",
      icon: "trophy",
      movies: academy,
      edition: ceremonyLabel("academy", academyRows),
    },
    {
      id: "cannes",
      name: "칸 영화제",
      icon: "star",
      movies: cannes,
      edition: ceremonyLabel("cannes", cannesRows),
    },
    {
      id: "berlin",
      name: "베를린 영화제",
      icon: "star",
      movies: berlin,
      edition: ceremonyLabel("berlin", berlinRows),
    },
    {
      id: "venice",
      name: "베니스 영화제",
      icon: "star",
      movies: venice,
      edition: ceremonyLabel("venice", veniceRows),
    },
  ].filter((tab) => tab.movies.length > 0) as AwardTab[];

  if (tabs.length === 0) return null;
  return <AwardWinnersSection tabs={tabs} />;
}

// 홈 상단 히어로 — 최근 인기 영화·오늘의 한줄평 데이터를 불러오는 동안에도 의자 화면은 바로 보인다(버튼만 잠시 비활성).
async function HomeHeroData() {
  const [lists, session] = await Promise.all([
    getHeroLists().catch((error) => {
      console.error("[home] 히어로 데이터 로드 실패", error);
      return { popular: [], today: [] };
    }),
    auth(),
  ]);
  const userId = session?.user?.id ?? null;
  // "오늘의 한줄평" 공감 버튼의 내 공감 여부 — 목록은 모두가 같은 캐시를 쓰므로 이것만 따로 조회한다.
  const liked =
    userId && lists.today.length > 0
      ? await db.reviewLike
          .findMany({ where: { userId, type: "LIKE", reviewId: { in: lists.today.map((r) => r.id) } }, select: { reviewId: true } })
          .catch(() => [])
      : [];
  return <HomeHero lists={lists} isLoggedIn={Boolean(userId)} likedReviewIds={liked.map((l) => l.reviewId)} />;
}

function MovieCategorySection() {
  return (
    <>
      <div className="px-4 pt-4 sm:px-5">
        <Suspense fallback={<HomeHero lists={null} />}>
          <HomeHeroData />
        </Suspense>
      </div>
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
  const movies = await safeMovieRows("getCuratedSeriesRow", getCuratedSeriesRow);
  if (movies.length === 0) return null;
  return <MovieRow title="추천 시리즈물" subtitle="사용자 평점순" movies={movies} />;
}

async function PopularSeriesSection() {
  const movies = await safeMovieRows("getPopularSeriesRow", getPopularSeriesRow);
  if (movies.length === 0) return null;
  return <MovieRow title="Best 시리즈물" subtitle="사용자 평점 높은 순" movies={movies} />;
}

async function Top10SeriesData() {
  const movies = await safeMovieRows("getTop10PopularSeriesRow", getTop10PopularSeriesRow);
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
  const movies = await safeMovieRows("getGenreRow", () => getGenreRow(genre, 0, 20));
  return <GenreMovieRow genre={genre} initialMovies={movies} />;
}

async function GenrePopularRowData({ genre }: { genre: GenreLabel }) {
  const movies = await safeMovieRows("getGenrePopularRow", () => getGenrePopularRow(genre));
  return <MovieRow title="사용자 인기영화" subtitle={`${genre} 장르 · 평점이 많이 달린 순 15편`} movies={movies} />;
}

async function GenreYearlyBestRowData({ genre }: { genre: GenreLabel }) {
  const movies = await safeMovieRows("getGenreYearlyBestRow", () => getGenreYearlyBestRow(genre));
  return <MovieRow title="올해의 Best" subtitle={`${genre} 장르 · 올해 개봉작 평점 높은 순 10편`} movies={movies} />;
}

async function GenreAllTimeBestRowData({ genre }: { genre: GenreLabel }) {
  const movies = await safeMovieRows("getGenreAllTimeBestRow", () => getGenreAllTimeBestRow(genre));
  return <MovieRow title="역대 Best" subtitle={`${genre} 장르 · 평점 높은 순 20편`} movies={movies} />;
}

// 장르 탭: 장르 영화 목록 + 그 장르 안에서의 인기(15)·추천(20)·올해 Best(10)·역대 Best(20).
// 평점이 적은 장르도 칸이 비지 않도록 각 행은 저장된 그 장르 영화로 채워진다.
function GenreSection({ genre }: { genre: GenreLabel }) {
  return (
    <>
      <Suspense key={genre} fallback={<RowSkeleton />}>
        <GenreRowData genre={genre} />
      </Suspense>
      <Suspense key={`popular-${genre}`} fallback={<RowSkeleton />}>
        <GenrePopularRowData genre={genre} />
      </Suspense>
      <RecommendedSection
        key={`rec-${genre}`}
        genre={genre}
        limit={20}
        title="추천 영화"
        subtitle={`${genre} 장르 · 회원님이 남긴 평점을 바탕으로 추천해요`}
      />
      <Suspense key={`yearly-${genre}`} fallback={<RowSkeleton />}>
        <GenreYearlyBestRowData genre={genre} />
      </Suspense>
      <Suspense key={`alltime-${genre}`} fallback={<RowSkeleton />}>
        <GenreAllTimeBestRowData genre={genre} />
      </Suspense>
    </>
  );
}

// 홈에서만 정식 주소(canonical)와 og:url을 지정한다. 탭(?category=…)이 바뀌어도 정식 주소는 홈 하나.
export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
  openGraph: { ...BASE_OPEN_GRAPH, url: SITE_URL, title: SITE_TITLE, description: SITE_DESCRIPTION },
};

// 검색엔진이 사이트 이름을 "STILL THEATER"로 표시하도록 하는 WebSite 구조화 데이터(홈에만).
const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  alternateName: ["스틸 시어터", "stilltheater.com"],
  url: SITE_URL,
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const category = resolveCategory(
    typeof params.category === "string" ? params.category : undefined
  );
  const genre = resolveGenre(typeof params.genre === "string" ? params.genre : undefined);

  return (
    <main>
      <script
        type="application/ld+json"
        // 고정된 객체를 JSON으로 직렬화할 뿐이라 사용자 입력이 섞이지 않는다. "<"는 이스케이프해 둔다.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD).replace(/</g, "\\u003c") }}
      />
      {category === "현재 상영중인 영화" && <NowShowingSection />}

      {category === "영화" && genre === "전체" && <MovieCategorySection />}
      {category === "영화" && genre !== "전체" && <GenreSection genre={genre} />}

      {category === "TV·시리즈물" && <TvSeriesSection />}

    </main>
  );
}
