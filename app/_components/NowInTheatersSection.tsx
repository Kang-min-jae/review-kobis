import { nowInTheaters } from "../_lib/mock-movies";
import MovieCard from "./MovieCard";

export default function NowInTheatersSection() {
  return (
    <section className="px-5 py-6">
      <h2 className="text-lg font-bold text-text">현재 상영중인 영화</h2>
      <p className="mt-1 text-sm text-muted">이번 주 새로 개봉한 영화</p>

      <div className="no-scrollbar mt-4 flex gap-4 overflow-x-auto pb-2">
        {nowInTheaters.map((movie) => (
          <MovieCard key={movie.id} movie={movie} />
        ))}
      </div>
    </section>
  );
}
