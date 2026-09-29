import MovieCard from "./MovieCard";
import ScrollRow from "./ScrollRow";
import AffinityRegistrar from "./AffinityRegistrar";
import type { RowMovie } from "../_lib/movie-rows";
import { isAdultContent } from "../_lib/adult-content";

export default function MovieRow({
  title,
  subtitle,
  movies: rawMovies,
  priorityCount = 0,
}: {
  title: string;
  subtitle?: string;
  movies: RowMovie[];
  priorityCount?: number;
}) {
  // 에로·성인 장르는 어느 행에서도 보여주지 않는다 — 행 데이터 단계에서 이미 거르지만,
  // 캐시된 행이나 새 경로로 섞여 들어오는 경우를 막는 마지막 안전망.
  const movies = rawMovies.filter((m) => !isAdultContent({ title: m.title, genreAlt: m.allGenres }));
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
