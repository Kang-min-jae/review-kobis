import Link from "next/link";
import RatingSummary from "./RatingSummary";
import type { Movie } from "../_lib/mock-movies";

export default function MovieCard({ movie }: { movie: Movie }) {
  return (
    <div className="w-36 shrink-0 sm:w-44">
      <div
        className={`group relative aspect-2/3 overflow-hidden rounded-lg bg-gradient-to-br ${movie.gradient}`}
      >
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
              className="flex-1 rounded-full border border-brand px-1.5 py-1.5 text-center text-[11px] font-semibold text-brand transition-colors hover:bg-brand hover:text-white"
            >
              예매하러 가기
            </Link>
          )}
          <Link
            href={`/movies/${movie.id}/rate`}
            className="flex-1 rounded-full border border-star px-1.5 py-1.5 text-center text-[11px] font-semibold text-star transition-colors hover:bg-star hover:text-black"
          >
            평점 남기기
          </Link>
        </div>
      </div>
    </div>
  );
}
