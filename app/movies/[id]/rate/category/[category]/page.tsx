import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "../../../../../../auth";
import { resolveMovieRateInfo } from "../../../../../_lib/movie-rate-info";
import { RATING_CATEGORIES, type RatingCategory } from "../../../../../_lib/category-ratings-store";
import {
  getAllCategoryAverages,
  getReviewsForCategoryType,
  getMyReview,
} from "../../../../../_lib/review-data";
import SiteHeader from "../../../../../_components/SiteHeader";
import BackBar from "../../../../../_components/BackBar";
import MovieHero from "../../../../../_components/MovieHero";
import AddToListButton from "../../../../../_components/AddToListButton";
import CategoryRatings from "../../../../../_components/CategoryRatings";
import CategoryRateForm from "../../../../../_components/CategoryRateForm";
import AwardsBanner from "../../../../../_components/AwardsBanner";
import TrailerBox from "../../../../../_components/TrailerBox";
import RatingDistribution from "../../../../../_components/RatingDistribution";
import SimilarMoviesSection from "../../../../../_components/SimilarMoviesSection";
import { getMovieAwardWins } from "../../../../../_lib/award-winners";
import { getTrailerData } from "../../../../../_lib/trailers";
import { safeDecode } from "../../../../../_lib/safe-decode";
import { db } from "../../../../../_lib/db";
import { BASE_OPEN_GRAPH, BASE_TWITTER } from "../../../../../_lib/site";

export async function generateMetadata({
  params,
}: PageProps<"/movies/[id]/rate/category/[category]">): Promise<Metadata> {
  const { id } = await params;
  const info = await resolveMovieRateInfo(id);
  if (!info) return {};
  const title = info.movieTitle;
  const description = `${title} 평점과 리뷰 — 연출, 연기, 각본, 음악, 편집 항목별 평가를 남겨보세요.`;
  return {
    title,
    description,
    openGraph: {
      ...BASE_OPEN_GRAPH,
      title,
      description,
      ...(info.posterUrl ? { images: [{ url: info.posterUrl }] } : {}),
    },
    twitter: { ...BASE_TWITTER, title, description, ...(info.posterUrl ? { images: [info.posterUrl] } : {}) },
  };
}

async function AwardsBannerData(props: { movieId: string; tmdbId: string | null; titleKo: string; titleEn: string | null }) {
  const wins = await getMovieAwardWins(props).catch(() => []);
  return <AwardsBanner wins={wins} />;
}

// 예고편은 TMDB 조회(처음 보는 영화)로 몇 초 걸릴 수 있어 페이지를 막지 않고 따로 불러온다.
async function TrailerBoxData(props: { tmdbId: string | null; movieTitle: string; movieCd: string; isNowShowing: boolean; isAdmin: boolean }) {
  const { trailers, candidates } = await getTrailerData(props.tmdbId);
  return (
    <TrailerBox
      trailers={trailers}
      candidates={props.isAdmin ? candidates : []}
      movieTitle={props.movieTitle}
      movieCd={props.movieCd}
      isNowShowing={props.isNowShowing}
      isAdmin={props.isAdmin}
    />
  );
}

function TrailerBoxSkeleton() {
  return (
    <section id="watch" className="scroll-mt-20 rounded-2xl border border-neutral-800 bg-surface p-4">
      <h2 className="text-sm font-bold text-text">공식 예고편 확인하기</h2>
      <div className="mt-3 aspect-video min-h-[200px] w-full animate-pulse rounded-xl bg-black/40" />
    </section>
  );
}

function isRatingCategory(value: string): value is RatingCategory {
  return (RATING_CATEGORIES as readonly string[]).includes(value);
}

export default async function CategoryRatePage({
  params,
}: PageProps<"/movies/[id]/rate/category/[category]">) {
  const { id, category: categoryParam } = await params;
  const category = safeDecode(categoryParam);

  if (!isRatingCategory(category)) {
    notFound();
  }

  const [info, session] = await Promise.all([resolveMovieRateInfo(id), auth()]);
  if (!info) {
    notFound();
  }
  const userId = session?.user?.id ?? null;

  // "스포일러 항상 보기" 설정에 따라 스포일러 리뷰 본문을 처음부터 보낼지가 달라져 먼저 읽는다.
  const prefsPromise = userId
    ? db.user.findUnique({ where: { id: userId }, select: { alwaysShowSpoilers: true } }).catch(() => null)
    : Promise.resolve(null);
  const reviewsFor = (type: "SHORT" | "LONG") =>
    prefsPromise.then((prefs) =>
      getReviewsForCategoryType(info.movieCd, category, type, userId, { alwaysShowSpoilers: prefs?.alwaysShowSpoilers ?? false })
    );

  const [averages, shortReviews, longReviews, myShortReview, myLongReview, prefs, following] = await Promise.all([
    getAllCategoryAverages(info.movieCd),
    reviewsFor("SHORT"),
    reviewsFor("LONG"),
    getMyReview(userId, info.movieCd, category, "SHORT"),
    getMyReview(userId, info.movieCd, category, "LONG"),
    prefsPromise,
    userId
      ? db.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }).catch(() => [])
      : Promise.resolve([]),
  ]);
  const overall = averages.find((a) => a.category === "전체");
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <main>
      <SiteHeader />
      <div className="px-4 py-5 sm:px-5 sm:py-6">
        <BackBar />

        <MovieHero
          movieTitle={info.movieTitle}
          description={info.description}
          posterUrl={info.posterUrl}
          gradient={info.gradient}
          releaseDate={info.releaseDate}
          rereleaseDate={info.rereleaseDate}
          runtimeMinutes={info.runtimeMinutes}
          genreAlt={info.genreAlt}
          director={info.director}
          cast={info.cast}
          boxOffice={info.boxOffice}
          memberAverage={overall?.average ?? null}
          memberCount={overall?.count ?? 0}
          actions={
            <AddToListButton movieId={info.movieId} title={info.movieTitle} posterUrl={info.posterUrl} gradient={info.gradient} />
          }
        >
          <CategoryRatings movieId={info.movieId} averages={averages} activeCategory={category} />
        </MovieHero>

        {/* 모바일(1열): 예고편·예매 → 평점(항목별 평점·리뷰) → 별점 분포 → 비슷한 영화 순서.
            넓은 화면(2열): 왼쪽에 평점, 오른쪽에 예고편·예매 / 별점 분포 / 비슷한 영화. 같은 요소를 grid 위치로만 옮긴다. */}
        {/* data-mobile-view: 모바일에서 "평점"(rate) / "예고편 · 예매"(watch) 중 어느 영역을 보일지 — 상단 버튼(ScrollToButton)이 바꾼다 */}
        <div
          id="detail-layout"
          data-mobile-view="rate"
          className="group/detail mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_auto_1fr] xl:grid-cols-[minmax(0,1fr)_480px]"
        >
          <div className="min-w-0 max-lg:hidden max-lg:group-data-[mobile-view=watch]/detail:block lg:col-start-2 lg:row-start-1">
            <Suspense fallback={<TrailerBoxSkeleton />}>
              <TrailerBoxData
                tmdbId={info.tmdbId ?? null}
                movieTitle={info.movieTitle}
                movieCd={info.movieCd}
                isNowShowing={info.boxOffice !== null}
                isAdmin={isAdmin}
              />
            </Suspense>
          </div>

          <div id="rate" className="min-w-0 scroll-mt-20 max-lg:group-data-[mobile-view=watch]/detail:hidden lg:col-start-1 lg:row-span-3 lg:row-start-1">
            {/* 처음 보는 영화는 수상 이력을 Wikidata에서 조회하느라 수 초 걸릴 수 있어, 페이지를 막지 않고 따로 불러온다. */}
            <Suspense fallback={null}>
              <AwardsBannerData movieId={info.movieId} tmdbId={info.tmdbId ?? null} titleKo={info.movieTitle} titleEn={info.movieTitleEn ?? null} />
            </Suspense>
            <div className="mb-4 lg:hidden">
              <CategoryRatings movieId={info.movieId} averages={averages} activeCategory={category} />
            </div>
            <CategoryRateForm
              movieId={info.movieId}
              movieCd={info.movieCd}
              movieTitle={info.movieTitle}
              moviePosterUrl={info.posterUrl}
              movieGradient={info.gradient}
              category={category}
              isLoggedIn={Boolean(userId)}
              userId={userId}
              userName={session?.user?.name ?? null}
              isAdmin={isAdmin}
              reviews={{ SHORT: shortReviews, LONG: longReviews }}
              myReviews={{ SHORT: myShortReview, LONG: myLongReview }}
              followingIds={following.map((f) => f.followingId)}
              alwaysShowSpoilers={prefs?.alwaysShowSpoilers ?? false}
            />
          </div>

          <div className="min-w-0 lg:col-start-2 lg:row-start-2">
            <RatingDistribution ratings={shortReviews.map((r) => r.rating)} />
          </div>

          <div className="min-w-0 lg:col-start-2 lg:row-start-3">
            <Suspense fallback={null}>
              <SimilarMoviesSection
                movieCd={info.movieCd}
                movieTitle={info.movieTitle}
                tmdbId={info.tmdbId ?? null}
                directorName={info.director?.name ?? null}
                leadActorName={info.cast[0]?.name ?? null}
                genreAlt={info.genreAlt}
                userId={userId}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}
