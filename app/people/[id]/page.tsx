import Link from "next/link";
import MovieCard from "../../_components/MovieCard";
import { getPersonFilmography } from "../../_lib/tmdb";
import type { RowMovie } from "../../_lib/movie-rows";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

export default async function PersonPage({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const personId = Number(id);
  const person = Number.isNaN(personId) ? null : await getPersonFilmography(personId);

  if (!person) {
    return (
      <main className="px-5 py-6">
        <Link href="/" className="text-sm text-muted hover:text-text">
          ← 뒤로
        </Link>
        <p className="mt-6 text-sm text-muted">
          인물 정보를 찾을 수 없어요. TMDB API 키가 설정되어 있는지 확인해 주세요.
        </p>
      </main>
    );
  }

  const movies: RowMovie[] = person.movies.map((m) => ({
    id: `tmdb-${m.id}`,
    title: m.title,
    posterUrl: m.posterUrl,
    gradient: FALLBACK_GRADIENT,
    isNowShowing: false,
  }));

  return (
    <main className="px-5 py-6">
      <Link href="/" className="text-sm text-muted hover:text-text">
        ← 뒤로
      </Link>

      <h1 className="mt-3 text-lg font-bold text-text">{person.name}</h1>
      <p className="mt-1 text-xs text-muted">참여 작품 {movies.length}편</p>

      {movies.length === 0 ? (
        <p className="mt-6 text-sm text-muted">등록된 참여 작품이 없어요.</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-4">
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      )}
    </main>
  );
}
