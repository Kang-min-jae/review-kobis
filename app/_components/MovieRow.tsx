import MovieCard from "./MovieCard";
import type { RowMovie } from "../_lib/movie-rows";

export default function MovieRow({
  title,
  subtitle,
  movies,
}: {
  title: string;
  subtitle?: string;
  movies: RowMovie[];
}) {
  if (movies.length === 0) return null;

  return (
    <section className="px-5 py-6">
      <h2 className="text-lg font-bold text-text">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}

<<<<<<< HEAD
      <div className="row-scrollbar mt-4 flex gap-4 overflow-x-auto pb-3">
=======
      <div className="no-scrollbar mt-4 flex gap-4 overflow-x-auto pb-2">
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} />
        ))}
      </div>
    </section>
  );
}
