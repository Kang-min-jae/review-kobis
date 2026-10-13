import { Suspense, type ComponentProps } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Session } from "next-auth";
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
import { BASE_OPEN_GRAPH, BASE_TWITTER, movieDetailPath } from "../../../../../_lib/site";
import { cdToMovieId } from "../../../../../_lib/rating-input";

export async function generateMetadata({
  params,
}: PageProps<"/movies/[id]/rate/category/[category]">): Promise<Metadata> {
  const { id, category: categoryParam } = await params;
  const info = await resolveMovieRateInfo(id);
  if (!info) return {};
  const title = info.movieTitle;
  const description = `${title} 평점과 리뷰 — 연출, 연기, 각본, 음악, 편집 항목별 평가를 남겨보세요.`;
  // 정식 주소 — 같은 영화가 다른 ID 표기(예: 숫자만, kobis-숫자)로 열려도 하나의 주소로 모은다.
  const category = safeDecode(categoryParam);
  const canonical = movieDetailPath(cdToMovieId(info.movieCd), isRatingCategory(category) ? category : "전체");
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      ...BASE_OPEN_GRAPH,
      url: canonical,
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

// 리뷰 영역(별점·한줄평 입력과 리뷰 목록)을 불러오는 동안의 뼈대 — 입력 칸 + 리뷰 카드 3개 자리.
function ReviewsSkeleton() {
  return (
    <div aria-busy="true" aria-label="리뷰를 불러오는 중">
      <div className="h-14 animate-pulse rounded-xl bg-neutral-800" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-neutral-800" />
        ))}
      </div>
    </div>
  );
}

function RatingDistributionSkeleton() {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-surface p-4" aria-busy="true">
      <h2 className="text-sm font-bold text-text">별점 분포</h2>
      <div className="mt-3 space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-2 animate-pulse rounded-full bg-black/40" />
        ))}
      </div>
    </section>
  );
}

type ReviewData = {
  session: Session | null;
  shortReviews: Awaited<ReturnType<typeof getReviewsForCategoryType>>;
  longReviews: Awaited<ReturnType<typeof getReviewsForCategoryType>>;
  myShortReview: Awaited<ReturnType<typeof getMyReview>>;
  myLongReview: Awaited<ReturnType<typeof getMyReview>>;
  alwaysShowSpoilers: boolean;
  followingIds: string[];
};

// 로그인 정보·리뷰 목록·내 리뷰·팔로잉 — 리뷰 영역과 별점 분포가 같이 쓰므로 한 번만 불러 나눠 준다.
async function loadReviewData(movieCd: string, category: RatingCategory, sessionPromise: Promise<Session | null>): Promise<ReviewData> {
  const session = await sessionPromise;
  const userId = session?.user?.id ?? null;
  // "스포일러 항상 보기" 설정에 따라 스포일러 리뷰 본문을 처음부터 보낼지가 달라져 먼저 읽는다.
  const prefs = userId
    ? await db.user.findUnique({ where: { id: userId }, select: { alwaysShowSpoilers: true } }).catch(() => null)
    : null;
  const alwaysShowSpoilers = prefs?.alwaysShowSpoilers ?? false;
  const [shortReviews, longReviews, myShortReview, myLongReview, following] = await Promise.all([
    getReviewsForCategoryType(movieCd, category, "SHORT", userId, { alwaysShowSpoilers }),
    getReviewsForCategoryType(movieCd, category, "LONG", userId, { alwaysShowSpoilers }),
    getMyReview(userId, movieCd, category, "SHORT"),
    getMyReview(userId, movieCd, category, "LONG"),
    userId
      ? db.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }).catch(() => [])
      : Promise.resolve([]),
  ]);
  return {
    session,
    shortReviews,
    longReviews,
    myShortReview,
    myLongReview,
    alwaysShowSpoilers,
    followingIds: following.map((f) => f.followingId),
  };
}

async function ReviewsSection({
  dataPromise,
  info,
  category,
}: {
  dataPromise: Promise<ReviewData>;
  info: NonNullable<Awaited<ReturnType<typeof resolveMovieRateInfo>>>;
  category: RatingCategory;
}) {
  const data = await dataPromise;
  const userId = data.session?.user?.id ?? null;
  return (
    <CategoryRateForm
      movieId={info.movieId}
      movieCd={info.movieCd}
      movieTitle={info.movieTitle}
      moviePosterUrl={info.posterUrl}
      movieGradient={info.gradient}
      category={category}
      isLoggedIn={Boolean(userId)}
      userId={userId}
      userName={data.session?.user?.name ?? null}
      isAdmin={data.session?.user?.role === "ADMIN"}
      reviews={{ SHORT: data.shortReviews, LONG: data.longReviews }}
      myReviews={{ SHORT: data.myShortReview, LONG: data.myLongReview }}
      followingIds={data.followingIds}
      alwaysShowSpoilers={data.alwaysShowSpoilers}
    />
  );
}

async function RatingDistributionData({ dataPromise }: { dataPromise: Promise<ReviewData> }) {
  const { shortReviews } = await dataPromise;
  return <RatingDistribution ratings={shortReviews.map((r) => r.rating)} />;
}

// 예고편 박스는 관리자에게만 후보 영상을 보여줘서 로그인 정보가 필요하다.
async function TrailerBoxWithSession(props: {
  sessionPromise: Promise<Session | null>;
  tmdbId: string | null;
  movieTitle: string;
  movieCd: string;
  isNowShowing: boolean;
}) {
  const { sessionPromise, ...rest } = props;
  const session = await sessionPromise;
  return <TrailerBoxData {...rest} isAdmin={session?.user?.role === "ADMIN"} />;
}

async function SimilarMoviesWithSession(
  props: Omit<ComponentProps<typeof SimilarMoviesSection>, "userId"> & { sessionPromise: Promise<Session | null> },
) {
  const { sessionPromise, ...rest } = props;
  const session = await sessionPromise;
  return <SimilarMoviesSection {...rest} userId={session?.user?.id ?? null} />;
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

  // 제목·포스터·줄거리·평점 요약(MovieHero)은 처음 HTML에 바로 들어가도록 여기서 먼저 읽는다 — 이 페이지엔
  // 로딩 화면(loading.tsx)을 두지 않는다(있으면 본문 전체가 숨겨진 스트리밍 블록으로 늦게 붙는다).
  // 영화 정보는 DB 캐시(CachedMovie, 3일 + 백그라운드 갱신), 박스오피스는 fetch 캐시(6시간)를 거쳐 빠르다.
  // 평점 요약은 별점을 남기면 바로 바뀌어야 해서 캐시 없이 읽는다(인덱스 걸린 집계 한 번).
  // 로그인 정보·리뷰처럼 사람마다 다르거나 느린 부분은 아래 <Suspense>에서 따로 불러온다.
  const sessionPromise = auth().catch(() => null);
  const info = await resolveMovieRateInfo(id);
  if (!info) {
    notFound();
  }
  const averages = await getAllCategoryAverages(info.movieCd);
  const overall = averages.find((a) => a.category === "전체");
  const reviewDataPromise = loadReviewData(info.movieCd, category, sessionPromise);
  // 두 Suspense 영역이 같이 기다리는 promise — 한쪽이 렌더되기 전에 실패해도 처리되지 않은 거부로 남지 않게 한다.
  reviewDataPromise.catch(() => {});

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
              <TrailerBoxWithSession
                sessionPromise={sessionPromise}
                tmdbId={info.tmdbId ?? null}
                movieTitle={info.movieTitle}
                movieCd={info.movieCd}
                isNowShowing={info.boxOffice !== null}
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
            <Suspense fallback={<ReviewsSkeleton />}>
              <ReviewsSection dataPromise={reviewDataPromise} info={info} category={category} />
            </Suspense>
          </div>

          <div className="min-w-0 lg:col-start-2 lg:row-start-2">
            <Suspense fallback={<RatingDistributionSkeleton />}>
              <RatingDistributionData dataPromise={reviewDataPromise} />
            </Suspense>
          </div>

          <div className="min-w-0 lg:col-start-2 lg:row-start-3">
            <Suspense fallback={null}>
              <SimilarMoviesWithSession
                sessionPromise={sessionPromise}
                movieCd={info.movieCd}
                movieTitle={info.movieTitle}
                tmdbId={info.tmdbId ?? null}
                directorName={info.director?.name ?? null}
                leadActorName={info.cast[0]?.name ?? null}
                genreAlt={info.genreAlt}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}
