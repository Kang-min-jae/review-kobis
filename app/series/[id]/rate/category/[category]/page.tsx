import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "../../../../../../auth";
import { resolveSeriesRateInfo } from "../../../../../_lib/series-rate-info";
import { RATING_CATEGORIES, type RatingCategory } from "../../../../../_lib/category-ratings-store";
import { getAllCategoryAverages } from "../../../../../_lib/review-data";
import SiteHeader from "../../../../../_components/SiteHeader";
import BackBar from "../../../../../_components/BackBar";
import MovieInfoHeader from "../../../../../_components/MovieInfoHeader";
import CategoryRatings from "../../../../../_components/CategoryRatings";
import { loadReviewData, ReviewsSection, ReviewsSkeleton } from "../../../../../_components/DetailReviews";
import { safeDecode } from "../../../../../_lib/safe-decode";
import { BASE_OPEN_GRAPH, BASE_TWITTER, movieDetailPath } from "../../../../../_lib/site";

function isRatingCategory(value: string): value is RatingCategory {
  return (RATING_CATEGORIES as readonly string[]).includes(value);
}

// 시리즈 상세(평점) 페이지 — 영화 상세 페이지와 같은 구조다. 제목·포스터·줄거리·평점 요약은 로딩 화면 없이
// 처음 HTML에 바로 그리고(이 경로엔 loading.tsx를 두지 않는다), 로그인 정보·리뷰처럼 사람마다 다르거나 느린
// 부분만 <Suspense>로 늦게 불러온다.
export async function generateMetadata({
  params,
}: PageProps<"/series/[id]/rate/category/[category]">): Promise<Metadata> {
  const { id, category: categoryParam } = await params;
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

export default async function SeriesCategoryRatePage({
  params,
}: PageProps<"/series/[id]/rate/category/[category]">) {
  const { id, category: categoryParam } = await params;
  const category = safeDecode(categoryParam);

  if (!isRatingCategory(category)) {
    notFound();
  }

  const sessionPromise = auth().catch(() => null);
  const info = await resolveSeriesRateInfo(id);
  if (!info) {
    notFound();
  }
  const averages = await getAllCategoryAverages(info.movieCd);
  const reviewDataPromise = loadReviewData(info.movieCd, category, sessionPromise);
  reviewDataPromise.catch(() => {});

  // 시즌 수가 있으면 "(시즌 N개)" 형태로 정보 표시
  const seasonNote = info.seasonCount ? `시즌 ${info.seasonCount}개` : null;

  return (
    <main>
      <SiteHeader />
      <div className="px-5 py-6">
        <BackBar />

        <MovieInfoHeader
          movieTitle={info.title}
          description={info.description}
          posterUrl={info.posterUrl}
          gradient={info.gradient}
          releaseDate={info.firstAirDate ? `${info.firstAirDate.slice(0, 4)}년 첫 방영` : null}
          rereleaseDate={null}
          runtimeMinutes={null}
          director={null}
          cast={[]}
          boxOffice={null}
        >
          <CategoryRatings movieId={info.seriesId} averages={averages} activeCategory={category} />
        </MovieInfoHeader>

        {seasonNote && (
          <p className="mt-2 text-xs text-muted">{seasonNote}</p>
        )}

        <div className="mt-6">
          <Suspense fallback={<ReviewsSkeleton />}>
            <ReviewsSection
              dataPromise={reviewDataPromise}
              movie={{ movieId: info.seriesId, movieCd: info.movieCd, title: info.title, posterUrl: info.posterUrl, gradient: info.gradient }}
              category={category}
            />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
