import Link from "next/link";
import PosterImage from "./PosterImage";
import RatingSummary from "./RatingSummary";
import HoverRating from "./HoverRating";
import TopLikedReview from "./TopLikedReview";
import type { RowMovie } from "../_lib/movie-rows";

export default function MovieCard({ movie }: { movie: RowMovie }) {
  return (
    <div className="w-40 shrink-0 sm:w-48">
      <div
        className={`group relative aspect-2/3 overflow-hidden rounded-lg ${
          movie.posterUrl ? "bg-surface" : `bg-gradient-to-br ${movie.gradient}`
        }`}
      >
        {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-100 transition-opacity duration-200 group-hover:opacity-0">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-text">
            ▶
          </span>
        </div>
        {movie.badge && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-star">
            {movie.badge}
          </span>
        )}
        <HoverRating movieId={movie.id} />
      </div>

      <div className="mt-2 space-y-1.5">
        <RatingSummary movieId={movie.id} />
        <TopLikedReview movieId={movie.id} />
        <p className="line-clamp-2 text-sm font-medium text-text">{movie.title}</p>

        <div className="flex gap-1.5">
          {movie.isNowShowing && (
            <Link
              href={`/theaters?movie=${movie.id}`}
              className="flex-1 whitespace-nowrap rounded-full border border-brand px-1 py-1.5 text-center text-[10px] font-semibold text-brand transition-colors hover:bg-brand hover:text-white"
            >
              예매하러 가기
            </Link>
          )}
          <Link
            href={`/movies/${movie.id}/rate`}
            className="flex-1 whitespace-nowrap rounded-full border border-star px-1 py-1.5 text-center text-[10px] font-semibold text-star transition-colors hover:bg-star hover:text-black"
          >
            평점 남기기
          </Link>
        </div>
      </div>
    </div>
  );
}
