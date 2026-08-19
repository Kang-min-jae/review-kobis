import Link from "next/link";
import MovieCard from "../../_components/MovieCard";
import { searchMovieCatalog, findMovieCdByTitle } from "../../_lib/kobis";
import { searchKmdbFilmography } from "../../_lib/kmdb";
import { getLocalNowShowingByMovieCd, applyNowShowingOverrides, toRowMovie } from "../../_lib/movie-rows";
import type { RowMovie } from "../../_lib/movie-rows";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

// KMDb에서 이름(+가능하면 인물 코드)으로 감독/배우 참여작을 찾고, 평점 페이지로 연결하기
// 위해 각 작품을 KOBIS movieCd와 매칭한다 (KOBIS에 없는 — 국내 미개봉 — 작품은 평점을
// 남길 방법이 없어서 목록에서 제외한다).
async function filmographyFromKmdb(name: string, personId: string | null): Promise<RowMovie[]> {
  const movies = await searchKmdbFilmography(name, personId);
  if (movies.length === 0) return [];

  const movieCds = await Promise.all(movies.map((m) => findMovieCdByTitle(m.title)));
  const rows: RowMovie[] = [];
  movies.forEach((movie, i) => {
    const movieCd = movieCds[i];
    if (!movieCd) return;
    rows.push({
      id: `kobis-${movieCd}`,
      title: movie.title,
      posterUrl: movie.posterUrl,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: false,
    });
  });
  return rows;
}

// KMDb 키가 없거나 KMDb에서 못 찾았을 때의 대체 경로 — KOBIS searchMovieList의
// directorNm으로 감독 재검색 (배우 이름으로는 필터링 불가).
async function filmographyFromKobisDirector(name: string): Promise<RowMovie[]> {
  const candidates = await searchMovieCatalog({ directorNm: name }, 30);
  return Promise.all(candidates.map(toRowMovie));
}

export default async function PersonPage({ params, searchParams }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const { pid } = await searchParams;
  const name = decodeURIComponent(id);
  const personId = typeof pid === "string" ? pid : null;

  const [kmdbRows, nowShowingMap] = await Promise.all([
    filmographyFromKmdb(name, personId),
    getLocalNowShowingByMovieCd(),
  ]);

  const rows = kmdbRows.length > 0 ? kmdbRows : await filmographyFromKobisDirector(name);
  const movies: RowMovie[] = applyNowShowingOverrides(rows, nowShowingMap);

  return (
    <main className="px-5 py-6">
      <Link href="/" className="text-sm text-muted hover:text-text">
        ← 뒤로
      </Link>

      <h1 className="mt-3 text-lg font-bold text-text">{name}</h1>
      <p className="mt-1 text-xs text-muted">참여작 {movies.length}편</p>

      <section className="mt-6">
        {movies.length === 0 ? (
          <p className="mt-2 text-sm text-muted">참여작을 찾을 수 없어요.</p>
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
