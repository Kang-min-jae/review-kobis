import MovieCard from "./MovieCard";
import ScrollRow from "./ScrollRow";
import AffinityRegistrar from "./AffinityRegistrar";
import type { RowMovie } from "../_lib/movie-rows";

export default function MovieRow({
  title,
  subtitle,
  movies,
  priorityCount = 0,
}: {
  title: string;
  subtitle?: string;
  movies: RowMovie[];
  priorityCount?: number;
}) {
  if (movies.length === 0) return null;

  return (
    // 화면 밖 줄은 스크롤로 가까워질 때까지 레이아웃·페인트를 건너뛴다(측정: 페인트 절반, 메인 스레드 12~17%↓).
    <section className="px-4 py-5 [contain-intrinsic-size:auto_380px] [content-visibility:auto] sm:px-5 sm:py-6">
      <h2 className="text-lg font-bold text-text">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}

      <AffinityRegistrar movieIds={movies.map((m) => m.id)} />
      <ScrollRow className="row-scrollbar mt-4 flex gap-3 overflow-x-auto pb-3 scroll-smooth sm:gap-4">
        {movies.map((movie, index) => (
          <MovieCard key={movie.id} movie={movie} popoverSide={index === movies.length - 1 ? "left" : "right"} priority={index < priorityCount} />
        ))}
      </ScrollRow>
    </section>
  );
}
