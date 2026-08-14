import Link from "next/link";
import PosterImage from "./PosterImage";
import RatingSummary from "./RatingSummary";
import { getTmdbPosterUrl } from "../_lib/tmdb";
import type { Movie } from "../_lib/mock-movies";

export default async function MovieCard({ movie }: { movie: Movie }) {
  const posterUrl = await getTmdbPosterUrl(movie.title);

  return (
    <div className="w-40 shrink-0 sm:w-48">
      <div
        className={`group relative aspect-2/3 overflow-hidden rounded-lg ${
          posterUrl ? "bg-surface" : `bg-gradient-to-br ${movie.gradient}`
        }`}
      >
        {posterUrl && <PosterImage src={posterUrl} alt={`${movie.title} 포스터`} />}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/40">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-text">
            ▶
          </span>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        <RatingSummary movieId={movie.id} />
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
