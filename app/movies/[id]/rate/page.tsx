import { notFound } from "next/navigation";
import { allMovies } from "../../../_lib/mock-movies";
import { getMovieInfoByTitle, getMovieDetailsByCd, getKoficBoxOfficeByTitle } from "../../../_lib/kobis";
import RateForm from "../../../_components/RateForm";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

export default async function RateMoviePage({ params }: PageProps<"/movies/[id]/rate">) {
  const { id } = await params;

  const localMovie = allMovies.find((m) => m.id === id);
  if (localMovie) {
    const [kobisInfo, boxOffice] = await Promise.all([
      getMovieInfoByTitle(localMovie.title, localMovie.englishTitle),
      getKoficBoxOfficeByTitle(localMovie.title),
    ]);

    // 재개봉작은 로컬 releaseDate가 "재개봉일"이라, 원 개봉일은 KOBIS에서 따로 가져온다.
    const releaseDate = localMovie.isRerelease
      ? (kobisInfo?.openDate ?? null)
      : (kobisInfo?.openDate ?? localMovie.releaseDate);
    const rereleaseDate = localMovie.isRerelease ? localMovie.releaseDate : null;

    return (
      <main className="px-5 py-6">
        <RateForm
          movieId={localMovie.id}
          movieCd={kobisInfo?.movieCd ?? null}
          movieTitle={localMovie.title}
          description={kobisInfo?.overview ?? localMovie.description}
          posterUrl={null}
          gradient={localMovie.gradient}
          releaseDate={releaseDate}
          rereleaseDate={rereleaseDate}
          director={kobisInfo?.director ?? null}
          cast={kobisInfo?.cast ?? []}
          boxOffice={boxOffice}
        />
      </main>
    );
  }

  if (id.startsWith("kobis-")) {
    const movieCd = id.slice("kobis-".length);
    const info = await getMovieDetailsByCd(movieCd);
    if (info) {
      const boxOffice = await getKoficBoxOfficeByTitle(info.title);
      return (
        <main className="px-5 py-6">
          <RateForm
            movieId={id}
            movieCd={info.movieCd}
            movieTitle={info.title}
            description={info.overview ?? "아직 등록된 설명이 없어요."}
            posterUrl={null}
            gradient={FALLBACK_GRADIENT}
            releaseDate={info.openDate}
            rereleaseDate={null}
            director={info.director}
            cast={info.cast}
            boxOffice={boxOffice}
          />
        </main>
      );
    }
  }

  notFound();
}
