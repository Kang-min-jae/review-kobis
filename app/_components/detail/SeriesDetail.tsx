import { Suspense, type ComponentProps } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Session } from "next-auth";
import { auth } from "../../../auth";
import { resolveSeriesRateInfo } from "../../_lib/series-rate-info";
import { RATING_CATEGORIES, type RatingCategory } from "../../_lib/category-ratings-store";
import { getAllCategoryAverages } from "../../_lib/review-data";
import SiteHeader from "../SiteHeader";
import BackBar from "../BackBar";
import MovieHero from "../MovieHero";
import AddToListButton from "../AddToListButton";
import SimilarSeriesSection from "../SimilarSeriesSection";
import TrailerBox from "../TrailerBox";
import { getTrailerData } from "../../_lib/trailers";
import CategoryRatings from "../CategoryRatings";
import {
  loadReviewData,
  RatingDistributionData,
  RatingDistributionSkeleton,
  ReviewsSection,
  ReviewsSkeleton,
} from "../DetailReviews";
import { safeDecode } from "../../_lib/safe-decode";
import { BASE_OPEN_GRAPH, BASE_TWITTER, movieDetailPath } from "../../_lib/site";

function isRatingCategory(value: string): value is RatingCategory {
  return (RATING_CATEGORIES as readonly string[]).includes(value);
}

// 시리즈 상세(평점) 페이지 — 영화 상세 페이지와 같은 화면(맨 위 카드 MovieHero, 왼쪽 리뷰, 오른쪽 공식 예고편·
// 별점 분포·비슷한 시리즈)에서 극장 예매만 뺐다. 제목·포스터·줄거리·평점 요약은 로딩 화면 없이 처음 HTML에
// 바로 그리고(이 경로엔 loading.tsx를 두지 않는다), 로그인 정보·리뷰처럼 사람마다 다르거나 느린 부분만
// <Suspense>로 늦게 불러온다.
// 로그인한 사람용 페이지(app/series/…/page.tsx)와 로그인 쿠키 없는 요청용 공용 캐시 페이지(app/anon/series/…)가
// 같이 쓴다. anonymous면 로그인 정보를 읽지 않아 모든 방문자에게 같은 화면이 되고, 그래서 캐시(ISR)할 수 있다.
export async function seriesDetailMetadata(id: string, categoryParam: string): Promise<Metadata> {
  const info = await resolveSeriesRateInfo(id);
  if (!info) return {};
  const title = info.title;
  const description = `${title} 평점과 리뷰 — 연출, 연기, 각본, 음악, 편집 항목별 평가를 남겨보세요.`;
  const category = safeDecode(categoryParam);
  // 정식 주소 — "전체"는 /series/<id>/rate, 그 밖의 항목은 /series/<id>/rate/category/<항목>.
  const canonical = movieDetailPath(info.seriesId, isRatingCategory(category) ? category : "전체");
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

// 공식 예고편 — 영화와 같은 규칙(배급·제작사 공식 채널 영상만, YouTube 공식 임베드로만 재생)으로 시리즈의
// TMDB 영상을 거른다. 처음 보는 시리즈는 채널 확인으로 몇 초 걸릴 수 있어 페이지를 막지 않고 따로 불러온다.
// 관리자에게만 숨겨진 후보와 직접 추가·차단 도구를 보여준다. 극장 예매는 두지 않는다.
async function SeriesTrailerBox(props: {
  sessionPromise: Promise<Session | null>;
  tmdbId: string;
  seriesId: string;
  title: string;
}) {
  const [session, { trailers, candidates }] = await Promise.all([
    props.sessionPromise,
    getTrailerData(props.tmdbId, props.seriesId, "tv"),
  ]);
  const isAdmin = session?.user?.role === "ADMIN";
  return (
    <TrailerBox
      trailers={trailers}
      candidates={isAdmin ? candidates : []}
      movieTitle={props.title}
      movieCd={props.seriesId}
      isNowShowing={false}
      isAdmin={isAdmin}
      showTheaters={false}
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

async function SimilarSeriesWithSession(
  props: Omit<ComponentProps<typeof SimilarSeriesSection>, "userId"> & { sessionPromise: Promise<Session | null> },
) {
  const { sessionPromise, ...rest } = props;
  const session = await sessionPromise;
  return <SimilarSeriesSection {...rest} userId={session?.user?.id ?? null} />;
}

export default async function SeriesDetail({
  id,
  categoryParam,
  anonymous,
}: {
  id: string;
  categoryParam: string;
  anonymous: boolean;
}) {
  const category = safeDecode(categoryParam);

  if (!isRatingCategory(category)) {
    notFound();
  }

  const sessionPromise: Promise<Session | null> = anonymous ? Promise.resolve(null) : auth().catch(() => null);
  const info = await resolveSeriesRateInfo(id);
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
      <SiteHeader anonymous={anonymous} />
      <div className="px-4 py-5 sm:px-5 sm:py-6">
        <BackBar />

        <MovieHero
          movieTitle={info.title}
          description={info.description}
          posterUrl={info.posterUrl}
          gradient={info.gradient}
          releaseDate={info.firstAirDate}
          rereleaseDate={null}
          runtimeMinutes={null}
          genreAlt={info.genre}
          director={null}
          cast={[]}
          boxOffice={null}
          memberAverage={overall?.average ?? null}
          memberCount={overall?.count ?? 0}
          yearLabel="년 첫 방영"
          extraMeta={info.seasonCount ? [`시즌 ${info.seasonCount}개`] : []}
          watchLabel="예고편"
          actions={<AddToListButton movieId={info.seriesId} title={info.title} posterUrl={info.posterUrl} gradient={info.gradient} />}
        >
          <CategoryRatings movieId={info.seriesId} averages={averages} activeCategory={category} />
        </MovieHero>

        {/* 영화 상세와 같은 배치(극장 예매만 뺐다).
            모바일(1열): 평점(항목별 평점·리뷰) → 별점 분포 → 비슷한 시리즈. 위의 "예고편" 버튼을 누르면 공식 예고편이 보인다.
            넓은 화면(2열): 왼쪽에 평점, 오른쪽에 공식 예고편 / 별점 분포 / 비슷한 시리즈. */}
        {/* data-mobile-view: 모바일에서 "평점"(rate) / "예고편"(watch) 중 어느 영역을 보일지 — 상단 버튼(ScrollToButton)이 바꾼다 */}
        <div
          id="detail-layout"
          data-mobile-view="rate"
          className="group/detail mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_auto_1fr] xl:grid-cols-[minmax(0,1fr)_480px]"
        >
          <div className="min-w-0 max-lg:hidden max-lg:group-data-[mobile-view=watch]/detail:block lg:col-start-2 lg:row-start-1">
            <Suspense fallback={<TrailerBoxSkeleton />}>
              <SeriesTrailerBox sessionPromise={sessionPromise} tmdbId={info.tmdbId} seriesId={info.seriesId} title={info.title} />
            </Suspense>
          </div>

          <div id="rate" className="min-w-0 scroll-mt-20 max-lg:group-data-[mobile-view=watch]/detail:hidden lg:col-start-1 lg:row-span-3 lg:row-start-1">
            <div className="mb-4 lg:hidden">
              <CategoryRatings movieId={info.seriesId} averages={averages} activeCategory={category} />
            </div>
            <Suspense fallback={<ReviewsSkeleton />}>
              <ReviewsSection
                dataPromise={reviewDataPromise}
                movie={{ movieId: info.seriesId, movieCd: info.movieCd, title: info.title, posterUrl: info.posterUrl, gradient: info.gradient }}
                category={category}
              />
            </Suspense>
          </div>

          <div className="min-w-0 lg:col-start-2 lg:row-start-2">
            <Suspense fallback={<RatingDistributionSkeleton />}>
              <RatingDistributionData dataPromise={reviewDataPromise} />
            </Suspense>
          </div>

          <div className="min-w-0 lg:col-start-2 lg:row-start-3">
            {/* 비슷한 시리즈는 TMDB 조회(처음 보는 시리즈)로 몇 초 걸릴 수 있어 페이지를 막지 않고 따로 불러온다. */}
            <Suspense fallback={null}>
              <SimilarSeriesWithSession
                sessionPromise={sessionPromise}
                seriesId={info.seriesId}
                tmdbId={info.tmdbId}
                title={info.title}
                genreAlt={info.genre}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}
