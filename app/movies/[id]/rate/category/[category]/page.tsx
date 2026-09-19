import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "../../../../../../auth";
import { resolveMovieRateInfo } from "../../../../../_lib/movie-rate-info";
import { RATING_CATEGORIES, type RatingCategory } from "../../../../../_lib/category-ratings-store";
import {
  getAllCategoryAverages,
  getMyCategoryScore,
  getReviewsForCategoryType,
  getMyReview,
} from "../../../../../_lib/review-data";
import SiteHeader from "../../../../../_components/SiteHeader";
import BackBar from "../../../../../_components/BackBar";
import MovieInfoHeader from "../../../../../_components/MovieInfoHeader";
import CategoryRatings from "../../../../../_components/CategoryRatings";
import CategoryRateForm from "../../../../../_components/CategoryRateForm";
import AwardsBanner from "../../../../../_components/AwardsBanner";
import { getMovieAwardWins } from "../../../../../_lib/award-winners";

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
      title,
      description,
      ...(info.posterUrl ? { images: [{ url: info.posterUrl }] } : {}),
    },
    twitter: { title, description },
  };
}

function isRatingCategory(value: string): value is RatingCategory {
  return (RATING_CATEGORIES as readonly string[]).includes(value);
}

export default async function CategoryRatePage({
  params,
}: PageProps<"/movies/[id]/rate/category/[category]">) {
  const { id, category: categoryParam } = await params;
  const category = decodeURIComponent(categoryParam);

  if (!isRatingCategory(category)) {
    notFound();
  }

  const info = await resolveMovieRateInfo(id);
  if (!info) {
    notFound();
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [averages, myScore, shortReviews, longReviews, myShortReview, myLongReview, awardWins] = await Promise.all([
    getAllCategoryAverages(info.movieCd),
    getMyCategoryScore(userId, info.movieCd, category),
    getReviewsForCategoryType(info.movieCd, category, "SHORT", userId),
    getReviewsForCategoryType(info.movieCd, category, "LONG", userId),
    getMyReview(userId, info.movieCd, category, "SHORT"),
    getMyReview(userId, info.movieCd, category, "LONG"),
    getMovieAwardWins({
      tmdbId: info.tmdbId ?? null,
      titleKo: info.movieTitle,
      titleEn: info.movieTitleEn ?? null,
    }),
  ]);

  const categoryAverage = averages.find((a) => a.category === category) ?? { average: null, count: 0 };

  return (
    <main>
      <SiteHeader />
      <div className="px-4 py-5 sm:px-5 sm:py-6">
        <BackBar />

        <MovieInfoHeader
          movieTitle={info.movieTitle}
          description={info.description}
          posterUrl={info.posterUrl}
          gradient={info.gradient}
          releaseDate={info.releaseDate}
          rereleaseDate={info.rereleaseDate}
          runtimeMinutes={info.runtimeMinutes}
          director={info.director}
          cast={info.cast}
          boxOffice={info.boxOffice}
        >
          <CategoryRatings movieId={info.movieId} averages={averages} activeCategory={category} />
        </MovieInfoHeader>

        <div className="mt-6">
          <AwardsBanner wins={awardWins} />
          <CategoryRateForm
            movieId={info.movieId}
            movieCd={info.movieCd}
            movieTitle={info.movieTitle}
            moviePosterUrl={info.posterUrl}
            movieGradient={info.gradient}
            category={category}
            isLoggedIn={Boolean(userId)}
            userId={userId}
            isAdmin={session?.user?.role === "ADMIN"}
            reviews={{ SHORT: shortReviews, LONG: longReviews }}
            myReviews={{ SHORT: myShortReview, LONG: myLongReview }}
          />
        </div>
      </div>
    </main>
  );
}
