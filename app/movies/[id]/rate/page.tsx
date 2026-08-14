import { notFound } from "next/navigation";
import { allMovies } from "../../../_lib/mock-movies";
import { getTmdbMovieInfo } from "../../../_lib/tmdb";
import RateForm from "../../../_components/RateForm";

export default async function RateMoviePage({ params }: PageProps<"/movies/[id]/rate">) {
  const { id } = await params;
  const movie = allMovies.find((m) => m.id === id);

  if (!movie) notFound();

  const tmdbInfo = await getTmdbMovieInfo({ title: movie.title, englishTitle: movie.englishTitle });

  return (
    <main className="px-5 py-6">
      <RateForm
        movieId={movie.id}
        movieTitle={movie.title}
        description={tmdbInfo?.overview ?? movie.description}
        posterUrl={tmdbInfo?.posterUrl ?? null}
        gradient={movie.gradient}
      />
    </main>
  );
}
