import { notFound } from "next/navigation";
import { resolveMovieRateInfo } from "../../../../../_lib/movie-rate-info";
import { RATING_CATEGORIES, type RatingCategory } from "../../../../../_lib/category-ratings-store";
import BackBar from "../../../../../_components/BackBar";
import MovieInfoHeader from "../../../../../_components/MovieInfoHeader";
import CategoryRatings from "../../../../../_components/CategoryRatings";
import CategoryRateForm from "../../../../../_components/CategoryRateForm";

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

  return (
    <main className="px-5 py-6">
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
        <CategoryRatings movieId={info.movieId} activeCategory={category} />
      </MovieInfoHeader>

      <div className="mt-6">
        <CategoryRateForm movieId={info.movieId} category={category} />
      </div>
    </main>
  );
}
