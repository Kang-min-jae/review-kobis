import { getMovieDetailsByCd, getKoficBoxOfficeByTitle, resolveRerelease, type KoficBoxOffice } from "./kobis";
import { searchKmdbMovie, resolvePersonId } from "./kmdb";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

// 평점 페이지에서 화면에 실제로 보여주는 출연진 수(MovieInfoHeader의 DISPLAY_CAST_LIMIT과
// 동일) — 그 이상은 화면에 안 보여서 클릭할 수 없으므로 코드를 역조회할 필요가 없다.
const DISPLAY_CAST_LIMIT = 6;

export type PersonRef = { name: string; kmdbId: string | null };

export type ResolvedMovieInfo = {
  movieId: string;
  movieCd: string;
  movieTitle: string;
  description: string;
  posterUrl: string | null;
  gradient: string;
  releaseDate: string | null;
  rereleaseDate: string | null;
  runtimeMinutes: number | null;
  director: PersonRef | null;
  cast: PersonRef[];
  boxOffice: KoficBoxOffice | null;
};

// KMDb 코드가 없는 인물(영화 자체가 KMDb에 없어서 KOBIS 이름만 있는 경우)에게 이름으로
// 코드를 역조회해서 붙여준다 — 인물 상세 페이지 링크가 이름이 아니라 코드 기반으로
// 들어가야 동명이인 필모그래피가 안 섞인다.
async function withResolvedId(person: PersonRef | null, role: "감독" | "배우"): Promise<PersonRef | null> {
  if (!person) return null;
  if (person.kmdbId) return person;
  const kmdbId = await resolvePersonId(person.name, role);
  return { name: person.name, kmdbId };
}

// KMDb/KOBIS 어느 쪽 인물 타입이든 kmdbId가 있으면 살리고 없으면 null로 통일한다.
function toPersonRef(person: { name: string; kmdbId?: string | null } | null): PersonRef | null {
  if (!person) return null;
  return { name: person.name, kmdbId: person.kmdbId ?? null };
}

// 평점 페이지와 항목별 평점 페이지가 공통으로 필요로 하는 영화 정보(포스터/개봉정보/
// 줄거리/감독·출연/박스오피스)를 KOBIS+KMDb에서 조합해 한 번에 만든다.
export async function resolveMovieRateInfo(id: string): Promise<ResolvedMovieInfo | null> {
  if (!id.startsWith("kobis-")) return null;

  const movieCd = id.slice("kobis-".length);
  const info = await getMovieDetailsByCd(movieCd);
  if (!info) return null;

  const { isRerelease, originalReleaseDate } = await resolveRerelease({
    movieCd: info.movieCd,
    title: info.title,
    openDate: info.openDate,
    director: info.director?.name ?? null,
  });
  const releaseDate = originalReleaseDate ?? info.openDate;
  const rereleaseDate = isRerelease ? info.openDate : null;

  const [boxOffice, kmdbInfo] = await Promise.all([
    getKoficBoxOfficeByTitle(info.title),
    searchKmdbMovie(info.title, releaseDate?.slice(0, 4) ?? null, {
      director: info.director?.name ?? null,
      cast: info.cast.map((c) => c.name),
    }),
  ]);

  const directorRaw = kmdbInfo?.director ?? info.director;
  const castRaw = kmdbInfo?.cast && kmdbInfo.cast.length > 0 ? kmdbInfo.cast : info.cast;
  const castToShow = castRaw.slice(0, DISPLAY_CAST_LIMIT).map(toPersonRef);

  const [director, cast] = await Promise.all([
    withResolvedId(toPersonRef(directorRaw), "감독"),
    Promise.all(castToShow.map((member) => withResolvedId(member, "배우"))),
  ]);

  return {
    movieId: id,
    movieCd: info.movieCd,
    movieTitle: info.title,
    description: kmdbInfo?.overview ?? info.overview ?? "아직 등록된 설명이 없어요.",
    posterUrl: kmdbInfo?.posterUrl ?? null,
    gradient: FALLBACK_GRADIENT,
    releaseDate: kmdbInfo?.releaseDate ?? releaseDate,
    rereleaseDate,
    runtimeMinutes: kmdbInfo?.runtimeMinutes ?? info.runtimeMinutes,
    director,
    cast: cast.filter((c): c is PersonRef => c !== null),
    boxOffice,
  };
}
