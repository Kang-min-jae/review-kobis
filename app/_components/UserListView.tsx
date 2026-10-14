import Link from "next/link";
import PosterImage from "./PosterImage";
import ScrollRow from "./ScrollRow";
import StarRating from "./StarRating";
import type { MyRatedMovie } from "../_lib/my-rated-movies";

function ReadOnlyMovieCard({ movie }: { movie: MyRatedMovie }) {
  const href = movie.id.startsWith("tmdb-tv-") ? `/series/${movie.id}/rate` : `/movies/${movie.id}/rate`;
  return (
    <div className="w-32 shrink-0">
      <Link prefetch={false}
        href={href}
        className={`relative block aspect-2/3 overflow-hidden rounded-lg ${
          movie.posterUrl ? "bg-surface" : `bg-gradient-to-br ${movie.gradient}`
        }`}
      >
        {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
      </Link>
      <p className="mt-2 line-clamp-2 text-xs font-medium text-text">{movie.title}</p>
      <div className="mt-1">
        <StarRating rating={movie.rating} scale={10} size="h-3 w-3" />
      </div>
    </div>
  );
}

export default function UserListView({
  movies,
  userName,
}: {
  movies: MyRatedMovie[];
  userName: string;
}) {
  if (movies.length === 0) {
    return (
      <div className="px-5 py-6 text-sm text-muted">
        {userName}님이 아직 평가한 영화가 없어요.
      </div>
    );
  }

  const topRated = [...movies].sort((a, b) => b.rating - a.rating);
  const recentRated = [...movies].sort((a, b) => (a.ratedAt < b.ratedAt ? 1 : -1));

  return (
    <div className="px-5 py-2 pb-10">
      {topRated.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-text">높게 평가한 작품</h2>
          <ScrollRow className="row-scrollbar mt-3 flex gap-4 overflow-x-auto pb-3">
            {topRated.map((movie) => (
              <ReadOnlyMovieCard key={movie.id} movie={movie} />
            ))}
          </ScrollRow>
        </div>
      )}

      {recentRated.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold text-text">최근에 평가한 작품</h2>
          <ScrollRow className="row-scrollbar mt-3 flex gap-4 overflow-x-auto pb-3">
            {recentRated.map((movie) => (
              <ReadOnlyMovieCard key={`recent-${movie.id}`} movie={movie} />
            ))}
          </ScrollRow>
        </div>
      )}
    </div>
  );
}
