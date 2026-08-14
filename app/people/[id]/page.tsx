import Link from "next/link";
import MovieCard from "../../_components/MovieCard";
import { searchMovieCatalog } from "../../_lib/kobis";
import { getLocalNowShowingByMovieCd, applyNowShowingOverrides, toRowMovie } from "../../_lib/movie-rows";
import type { RowMovie } from "../../_lib/movie-rows";

// KOBIS 오픈API엔 인물 상세/필모그래피 API가 없다 — searchMovieList의 directorNm으로
// 감독 이름을 재검색하는 방식만 가능하다 (배우 이름으로 필터링하는 파라미터는 없음).
// 그래서 이 페이지는 실질적으로 "감독 페이지"로 동작하고, 배우 이름으로 들어오면
// 결과가 비어있을 수 있다.
export default async function PersonPage({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const name = decodeURIComponent(id);

  const [candidates, nowShowingMap] = await Promise.all([
    searchMovieCatalog({ directorNm: name }, 30),
    getLocalNowShowingByMovieCd(),
  ]);

  const movies: RowMovie[] = applyNowShowingOverrides(candidates.map(toRowMovie), nowShowingMap);

  return (
    <main className="px-5 py-6">
      <Link href="/" className="text-sm text-muted hover:text-text">
        ← 뒤로
      </Link>

      <h1 className="mt-3 text-lg font-bold text-text">{name}</h1>
      <p className="mt-1 text-xs text-muted">감독 참여작 {movies.length}편</p>

      <section className="mt-6">
        {movies.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            감독으로 등록된 영화를 찾을 수 없어요. KOBIS 오픈API는 배우 이름으로는 필모그래피
            검색을 지원하지 않아요.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-4">
            {movies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
