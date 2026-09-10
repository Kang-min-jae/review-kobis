import { notFound } from "next/navigation";
import { auth } from "../../../../../../auth";
import { resolveSeriesRateInfo } from "../../../../../_lib/series-rate-info";
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

function isRatingCategory(value: string): value is RatingCategory {
  return (RATING_CATEGORIES as readonly string[]).includes(value);
}

export default async function SeriesCategoryRatePage({
  params,
}: {
  params: Promise<{ id: string; category: string }>;
}) {
  const { id, category: categoryParam } = await params;
  const category = decodeURIComponent(categoryParam);

  if (!isRatingCategory(category)) {
    notFound();
  }

  const info = await resolveSeriesRateInfo(id);
  if (!info) {
    notFound();
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [averages, myScore, shortReviews, longReviews, myShortReview, myLongReview] = await Promise.all([
    getAllCategoryAverages(info.movieCd),
    getMyCategoryScore(userId, info.movieCd, category),
    getReviewsForCategoryType(info.movieCd, category, "SHORT", userId),
    getReviewsForCategoryType(info.movieCd, category, "LONG", userId),
    getMyReview(userId, info.movieCd, category, "SHORT"),
    getMyReview(userId, info.movieCd, category, "LONG"),
  ]);

  const categoryAverage = averages.find((a) => a.category === category) ?? { average: null, count: 0 };

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
          <CategoryRateForm
            movieId={info.seriesId}
            movieCd={info.movieCd}
            category={category}
            isLoggedIn={Boolean(userId)}
            categoryAverage={categoryAverage}
            myScore={myScore}
            reviews={{ SHORT: shortReviews, LONG: longReviews }}
            myReviews={{ SHORT: myShortReview, LONG: myLongReview }}
          />
        </div>
      </div>
    </main>
  );
}
