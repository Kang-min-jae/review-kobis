import { notFound } from "next/navigation";
import { allMovies } from "../../../_lib/mock-movies";
import { getTmdbMovieInfo, getTmdbMovieById } from "../../../_lib/tmdb";
import RateForm from "../../../_components/RateForm";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

export default async function RateMoviePage({ params }: PageProps<"/movies/[id]/rate">) {
  const { id } = await params;

  const localMovie = allMovies.find((m) => m.id === id);
  if (localMovie) {
    const tmdbInfo = await getTmdbMovieInfo({
      title: localMovie.title,
      englishTitle: localMovie.englishTitle,
    });

    return (
      <main className="px-5 py-6">
        <RateForm
          movieId={localMovie.id}
          movieTitle={localMovie.title}
          description={tmdbInfo?.overview ?? localMovie.description}
          posterUrl={tmdbInfo?.posterUrl ?? null}
          gradient={localMovie.gradient}
        />
      </main>
    );
  }

  if (id.startsWith("tmdb-")) {
    const tmdbId = Number(id.slice("tmdb-".length));
    const info = Number.isNaN(tmdbId) ? null : await getTmdbMovieById(tmdbId);
    if (info) {
      return (
        <main className="px-5 py-6">
          <RateForm
            movieId={id}
            movieTitle={info.title}
            description={info.overview ?? "아직 등록된 설명이 없어요."}
            posterUrl={info.posterUrl}
            gradient={FALLBACK_GRADIENT}
          />
        </main>
      );
    }
  }

  notFound();
}
