import { notFound } from "next/navigation";
import { allMovies } from "../../../_lib/mock-movies";
import { getTmdbMovieInfo, getTmdbMovieDetails } from "../../../_lib/tmdb";
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

    // 재개봉작은 로컬 releaseDate가 "재개봉일"이라, 원 개봉일은 TMDB에서 따로 가져온다.
    const releaseDate = localMovie.isRerelease
      ? (tmdbInfo?.releaseDate ?? null)
      : (tmdbInfo?.releaseDate ?? localMovie.releaseDate);
    const rereleaseDate = localMovie.isRerelease ? localMovie.releaseDate : null;

    return (
      <main className="px-5 py-6">
        <RateForm
          movieId={localMovie.id}
          movieTmdbId={tmdbInfo?.id ?? null}
          movieTitle={localMovie.title}
          description={tmdbInfo?.overview ?? localMovie.description}
          posterUrl={tmdbInfo?.posterUrl ?? null}
          gradient={localMovie.gradient}
          releaseDate={releaseDate}
          rereleaseDate={rereleaseDate}
          director={tmdbInfo?.director ?? null}
          cast={tmdbInfo?.cast ?? []}
        />
      </main>
    );
  }

  if (id.startsWith("tmdb-")) {
    const tmdbId = Number(id.slice("tmdb-".length));
    const info = Number.isNaN(tmdbId) ? null : await getTmdbMovieDetails(tmdbId);
    if (info) {
      return (
        <main className="px-5 py-6">
          <RateForm
            movieId={id}
            movieTmdbId={info.id}
            movieTitle={info.title}
            description={info.overview ?? "아직 등록된 설명이 없어요."}
            posterUrl={info.posterUrl}
            gradient={FALLBACK_GRADIENT}
            releaseDate={info.releaseDate}
            rereleaseDate={null}
            director={info.director}
            cast={info.cast}
          />
        </main>
      );
    }
  }

  notFound();
}
