import { notFound } from "next/navigation";
import { allMovies } from "../../../_lib/mock-movies";
import { getMovieInfoByTitle, getMovieDetailsByCd, getKoficBoxOfficeByTitle } from "../../../_lib/kobis";
import { searchKmdbMovie } from "../../../_lib/kmdb";
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
    const kmdbInfo = await searchKmdbMovie(
      localMovie.title,
      kobisInfo?.openDate?.slice(0, 4) ?? null
    );

    // 재개봉작은 로컬 releaseDate가 "재개봉일"이라, 원 개봉일은 KOBIS/KMDb에서 따로 가져온다.
    const originalOpenDate = kmdbInfo?.releaseDate ?? kobisInfo?.openDate ?? null;
    const releaseDate = localMovie.isRerelease
      ? originalOpenDate
      : (originalOpenDate ?? localMovie.releaseDate);
    const rereleaseDate = localMovie.isRerelease ? localMovie.releaseDate : null;

    return (
      <main className="px-5 py-6">
        <RateForm
          movieId={localMovie.id}
          movieCd={kobisInfo?.movieCd ?? null}
          movieTitle={localMovie.title}
          description={kmdbInfo?.overview ?? kobisInfo?.overview ?? localMovie.description}
          posterUrl={kmdbInfo?.posterUrl ?? null}
          gradient={localMovie.gradient}
          releaseDate={releaseDate}
          rereleaseDate={rereleaseDate}
          director={kmdbInfo?.director ?? kobisInfo?.director ?? null}
          cast={kmdbInfo?.cast && kmdbInfo.cast.length > 0 ? kmdbInfo.cast : (kobisInfo?.cast ?? [])}
          boxOffice={boxOffice}
        />
      </main>
    );
  }

  if (id.startsWith("kobis-")) {
    const movieCd = id.slice("kobis-".length);
    const info = await getMovieDetailsByCd(movieCd);
    if (info) {
      const [boxOffice, kmdbInfo] = await Promise.all([
        getKoficBoxOfficeByTitle(info.title),
        searchKmdbMovie(info.title, info.openDate?.slice(0, 4) ?? null),
      ]);
      return (
        <main className="px-5 py-6">
          <RateForm
            movieId={id}
            movieCd={info.movieCd}
            movieTitle={info.title}
            description={kmdbInfo?.overview ?? info.overview ?? "아직 등록된 설명이 없어요."}
            posterUrl={kmdbInfo?.posterUrl ?? null}
            gradient={FALLBACK_GRADIENT}
            releaseDate={kmdbInfo?.releaseDate ?? info.openDate}
            rereleaseDate={null}
            director={kmdbInfo?.director ?? info.director}
            cast={kmdbInfo?.cast && kmdbInfo.cast.length > 0 ? kmdbInfo.cast : info.cast}
            boxOffice={boxOffice}
          />
        </main>
      );
    }
  }

  notFound();
}
