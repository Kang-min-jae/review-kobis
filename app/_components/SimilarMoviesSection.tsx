import MovieCard from "./MovieCard";
import ScrollRow from "./ScrollRow";
import { getSimilarMovies } from "../_lib/similar-movies";

// 상세 페이지 오른쪽 "이 영화를 좋아한 사람들이 본"(회원 평점 기반) / "비슷한 영화"(폴백) 카드 3개.
// 다른 행과 같은 포스터 카드(MovieCard)를 쓰고, 누르면 그 영화 상세 페이지로 간다.
export default async function SimilarMoviesSection(props: Parameters<typeof getSimilarMovies>[0]) {
  const { title, movies } = await getSimilarMovies(props).catch(() => ({ title: "", movies: [] }));
  if (movies.length === 0) return null;

  return (
    <section className="rounded-2xl border border-neutral-800 bg-surface p-4">
      <h2 className="text-sm font-bold text-text">{title}</h2>
      <ScrollRow className="row-scrollbar mt-3 flex gap-3 overflow-x-auto pb-2">
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} popoverSide="left" />
        ))}
      </ScrollRow>
    </section>
  );
}
