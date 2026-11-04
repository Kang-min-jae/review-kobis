import { Suspense, type ComponentProps } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import type { Session } from "next-auth";
import { auth } from "../../../auth";
import { resolveMovieRateInfo } from "../../_lib/movie-rate-info";
import { RATING_CATEGORIES, type RatingCategory } from "../../_lib/category-ratings-store";
import { getAllCategoryAverages } from "../../_lib/review-data";
import SiteHeader from "../SiteHeader";
import { InOrder } from "../InOrder";
import BackBar from "../BackBar";
import MovieHero from "../MovieHero";
import AddToListButton from "../AddToListButton";
import CategoryRatings from "../CategoryRatings";
import AwardsBanner from "../AwardsBanner";
import TrailerBox from "../TrailerBox";
import SimilarMoviesSection from "../SimilarMoviesSection";
import { getMovieAwardWins } from "../../_lib/award-winners";
import { getTrailerData } from "../../_lib/trailers";
import { safeDecode } from "../../_lib/safe-decode";
import { isTemporarilyUnavailable, redirectTemporarilyUnavailable } from "../../_lib/unavailable";
import {
  loadReviewData,
  RatingDistributionData,
  RatingDistributionSkeleton,
  ReviewsSection,
  ReviewsSkeleton,
} from "../DetailReviews";
import { BASE_OPEN_GRAPH, BASE_TWITTER, movieDetailPath } from "../../_lib/site";
import { cdToMovieId, isSeriesCd } from "../../_lib/rating-input";

// 영화 상세(평점) 페이지 — 로그인한 사람용 페이지(app/movies/…/page.tsx)와 로그인 쿠키 없는 요청용 공용 캐시
// 페이지(app/anon/movies/…/page.tsx)가 같이 쓴다. anonymous면 로그인 정보를 읽지 않아 모든 방문자에게 같은
// 화면이 되고, 그래서 캐시(ISR)할 수 있다(내 리뷰·관리자 도구·내가 본 영화 빼기는 로그인한 사람 페이지에서만).
export async function movieDetailMetadata(id: string, categoryParam: string): Promise<Metadata> {
  if (isSeriesCd(id)) return {}; // 페이지가 /series로 보낸다
  // 외부 API를 잠깐 쓸 수 없어 정보가 없으면 본문이 일시 중단 안내로 보낸다(로그도 거기서 한 번만 남긴다).
  const info = await resolveMovieRateInfo(id).catch((error) => {
    if (isTemporarilyUnavailable(error)) return null;
    throw error;
  });
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
    // 항목별(연출·연기 등) 페이지는 대표 주소("전체")만 검색에 남긴다 — robots.txt도 수집을 막는다.
    ...(category !== "전체" ? { robots: { index: false, follow: true } } : {}),
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
  const { trailers, candidates } = await getTrailerData(props.tmdbId, props.movieCd);
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

export default async function MovieDetail({
  id,
  categoryParam,
  anonymous,
}: {
  id: string;
  categoryParam: string;
  anonymous: boolean;
}) {
  const category = safeDecode(categoryParam);

  // 시리즈(tmdb-tv-*)는 /series 주소가 정식 — 프로필·리뷰 목록 등에서 /movies로 연결돼 들어와도 시리즈 페이지로 보낸다.
  if (isSeriesCd(id)) {
    permanentRedirect(movieDetailPath(id, isRatingCategory(category) ? category : "전체"));
  }

  if (!isRatingCategory(category)) {
    notFound();
  }

  // 제목·포스터·줄거리·평점 요약(MovieHero)은 처음 HTML에 바로 들어가도록 여기서 먼저 읽는다 — 이 페이지엔
  // 로딩 화면(loading.tsx)을 두지 않는다(있으면 본문 전체가 숨겨진 스트리밍 블록으로 늦게 붙는다).
  // 영화 정보는 DB 캐시(CachedMovie, 3일 + 백그라운드 갱신), 박스오피스는 fetch 캐시(6시간)를 거쳐 빠르다.
  // 평점 요약은 별점을 남기면 바로 바뀌어야 해서 캐시 없이 읽는다(인덱스 걸린 집계 한 번).
  // 로그인 정보·리뷰처럼 사람마다 다르거나 느린 부분은 아래 <Suspense>에서 따로 불러온다.
  const sessionPromise: Promise<Session | null> = anonymous ? Promise.resolve(null) : auth().catch(() => null);
  // 저장된 정보도 없는데 외부 API(KOBIS·TMDB)를 잠깐 쓸 수 없으면 "없는 영화"(404)나 오류(500)가 아니라
  // 일시 중단(503 + Retry-After)으로 끝낸다(app/_lib/unavailable.ts). 저장된 정보가 있으면 그것으로 그린다.
  let info: Awaited<ReturnType<typeof resolveMovieRateInfo>>;
  try {
    info = await resolveMovieRateInfo(id);
  } catch (error) {
    if (!isTemporarilyUnavailable(error)) throw error;
    return redirectTemporarilyUnavailable(error, movieDetailPath(id, isRatingCategory(category) ? category : "전체"), anonymous);
  }
  if (!info) {
    notFound();
  }
  const averages = await getAllCategoryAverages(info.movieCd);
  const overall = averages.find((a) => a.category === "전체");
  const reviewDataPromise = loadReviewData(info.movieCd, category, sessionPromise);
  // 두 Suspense 영역이 같이 기다리는 promise — 한쪽이 렌더되기 전에 실패해도 처리되지 않은 거부로 남지 않게 한다.
  reviewDataPromise.catch(() => {});
  const reviewTarget = { movieId: info.movieId, movieCd: info.movieCd, title: info.movieTitle, posterUrl: info.posterUrl, gradient: info.gradient };
  const similarInput = {
    movieCd: info.movieCd,
    movieTitle: info.movieTitle,
    tmdbId: info.tmdbId ?? null,
    directorName: info.director?.name ?? null,
    leadActorName: info.cast[0]?.name ?? null,
    genreAlt: info.genreAlt,
  };
  // 공용 캐시 페이지(anonymous)는 아래 부분들을 화면 순서대로 페이지에 넣는다(InOrder) — 다시 만들어도 내용이
  // 같으면 바이트도 같아서 Vercel이 ISR 캐시를 새로 쓰지 않는다. 로그인한 사람의 페이지는 준비된 부분부터 보여 준다.

  return (
    <main>
      <SiteHeader anonymous={anonymous} />
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
              {anonymous ? (
                <InOrder
                  node={TrailerBoxData({
                    tmdbId: info.tmdbId ?? null,
                    movieTitle: info.movieTitle,
                    movieCd: info.movieCd,
                    isNowShowing: info.boxOffice !== null,
                    isAdmin: false,
                  })}
                />
              ) : (
                <TrailerBoxWithSession
                  sessionPromise={sessionPromise}
                  tmdbId={info.tmdbId ?? null}
                  movieTitle={info.movieTitle}
                  movieCd={info.movieCd}
                  isNowShowing={info.boxOffice !== null}
                />
              )}
            </Suspense>
          </div>

          <div id="rate" className="min-w-0 scroll-mt-20 max-lg:group-data-[mobile-view=watch]/detail:hidden lg:col-start-1 lg:row-span-3 lg:row-start-1">
            {/* 처음 보는 영화는 수상 이력을 Wikidata에서 조회하느라 수 초 걸릴 수 있어, 페이지를 막지 않고 따로 불러온다. */}
            <Suspense fallback={null}>
              {anonymous ? (
                <InOrder node={AwardsBannerData({ movieId: info.movieId, tmdbId: info.tmdbId ?? null, titleKo: info.movieTitle, titleEn: info.movieTitleEn ?? null })} />
              ) : (
                <AwardsBannerData movieId={info.movieId} tmdbId={info.tmdbId ?? null} titleKo={info.movieTitle} titleEn={info.movieTitleEn ?? null} />
              )}
            </Suspense>
            <div className="mb-4 lg:hidden">
              <CategoryRatings movieId={info.movieId} averages={averages} activeCategory={category} />
            </div>
            <Suspense fallback={<ReviewsSkeleton />}>
              {anonymous ? (
                <InOrder node={ReviewsSection({ dataPromise: reviewDataPromise, movie: reviewTarget, category })} />
              ) : (
                <ReviewsSection dataPromise={reviewDataPromise} movie={reviewTarget} category={category} />
              )}
            </Suspense>
          </div>

          <div className="min-w-0 lg:col-start-2 lg:row-start-2">
            <Suspense fallback={<RatingDistributionSkeleton />}>
              {anonymous ? (
                <InOrder node={RatingDistributionData({ dataPromise: reviewDataPromise })} />
              ) : (
                <RatingDistributionData dataPromise={reviewDataPromise} />
              )}
            </Suspense>
          </div>

          <div className="min-w-0 lg:col-start-2 lg:row-start-3">
            <Suspense fallback={null}>
              {anonymous ? (
                <InOrder node={SimilarMoviesSection({ ...similarInput, userId: null })} />
              ) : (
                <SimilarMoviesWithSession sessionPromise={sessionPromise} {...similarInput} />
              )}
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}
