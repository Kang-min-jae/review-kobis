import { notFound } from "next/navigation";
import { getMovieDetailsByCd } from "../../../../../_lib/kobis";
import { RATING_CATEGORIES, type RatingCategory } from "../../../../../_lib/category-ratings-store";
import CategoryRateForm from "../../../../../_components/CategoryRateForm";

function isRatingCategory(value: string): value is RatingCategory {
  return (RATING_CATEGORIES as readonly string[]).includes(value);
}

export default async function CategoryRatePage({
  params,
}: PageProps<"/movies/[id]/rate/category/[category]">) {
  const { id, category: categoryParam } = await params;
  const category = decodeURIComponent(categoryParam);

  if (!id.startsWith("kobis-") || !isRatingCategory(category)) {
    notFound();
  }

  const movieCd = id.slice("kobis-".length);
  const info = await getMovieDetailsByCd(movieCd);
  if (!info) {
    notFound();
  }

  return <CategoryRateForm movieId={id} movieTitle={info.title} category={category} />;
}
