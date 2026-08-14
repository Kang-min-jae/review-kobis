import Link from "next/link";
import MovieCard from "../../_components/MovieCard";
import PosterImage from "../../_components/PosterImage";
import { getPersonFilmography } from "../../_lib/tmdb";
import { getLocalNowShowingByTmdbId, applyNowShowingOverrides } from "../../_lib/movie-rows";
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

  const nowShowingMap = await getLocalNowShowingByTmdbId();
  const movies: RowMovie[] = applyNowShowingOverrides(
    person.movies.map((m) => ({
      id: `tmdb-${m.id}`,
      title: m.title,
      posterUrl: m.posterUrl,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: false,
    })),
    nowShowingMap
  );

  return (
    <main className="px-5 py-6">
      <Link href="/" className="text-sm text-muted hover:text-text">
        ← 뒤로
      </Link>

      <h1 className="mt-3 text-lg font-bold text-text">{person.name}</h1>
      <p className="mt-1 text-xs text-muted">
        영화 {movies.length}편 · 드라마 {person.tvShows.length}편
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-bold text-text">영화</h2>
        {movies.length === 0 ? (
          <p className="mt-2 text-sm text-muted">등록된 참여 영화가 없어요.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-4">
            {movies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-bold text-text">드라마</h2>
        {person.tvShows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">등록된 참여 드라마가 없어요.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-4">
            {person.tvShows.map((tv) => (
              <div key={tv.id} className="w-40 shrink-0 sm:w-48">
                <div
                  className={`relative aspect-2/3 overflow-hidden rounded-lg ${
                    tv.posterUrl ? "bg-surface" : `bg-gradient-to-br ${FALLBACK_GRADIENT}`
                  }`}
                >
                  {tv.posterUrl && <PosterImage src={tv.posterUrl} alt={`${tv.title} 포스터`} />}
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-text">{tv.title}</p>
                {tv.firstAirDate && (
                  <p className="text-xs text-muted">{tv.firstAirDate.slice(0, 4)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
