import { getMovieDetailsByCd, getKoficBoxOfficeByTitle, resolveRerelease, type KoficBoxOffice } from "./kobis";
import { searchKmdbMovie, resolvePersonId } from "./kmdb";
import { db } from "./db";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

// 평점 페이지에서 화면에 실제로 보여주는 출연진 수(MovieInfoHeader의 DISPLAY_CAST_LIMIT과
// 동일) — 그 이상은 화면에 안 보여서 클릭할 수 없으므로 코드를 역조회할 필요가 없다.
const DISPLAY_CAST_LIMIT = 6;

// 영화 상세정보(포스터/줄거리/감독·출연)는 특정 영화를 볼 때만 필요한 long-tail
// 데이터라 lazy cache로 관리한다 — 이 시간(3일)이 지나면 다음 조회 때 KOBIS+KMDb에서
// 다시 받아와 갱신한다. 박스오피스 수치는 매일 바뀌므로 캐시하지 않고 항상 새로 받는다.
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3;

export type PersonRef = { name: string; kmdbId: string | null };

type MovieMeta = {
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
};

export type ResolvedMovieInfo = MovieMeta & {
  movieId: string;
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

type CachedMovieRow = NonNullable<Awaited<ReturnType<typeof db.cachedMovie.findUnique>>>;

function rowToMeta(row: CachedMovieRow): MovieMeta {
  return {
    movieCd: row.movieCd,
    movieTitle: row.title,
    description: row.overview ?? "아직 등록된 설명이 없어요.",
    posterUrl: row.posterUrl,
    gradient: FALLBACK_GRADIENT,
    releaseDate: row.releaseDate,
    rereleaseDate: row.rereleaseDate,
    runtimeMinutes: row.runtimeMinutes,
    director: row.directorName ? { name: row.directorName, kmdbId: row.directorKmdbId } : null,
    cast: row.cast as PersonRef[],
  };
}

// KOBIS+KMDb를 조합해 영화 정보를 새로 받아오고, 다음 조회를 위해 캐시에 저장한다.
async function fetchAndCacheMovieMeta(movieCd: string): Promise<MovieMeta | null> {
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

  const kmdbInfo = await searchKmdbMovie(info.title, releaseDate?.slice(0, 4) ?? null, {
    director: info.director?.name ?? null,
    cast: info.cast.map((c) => c.name),
  });

  const directorRaw = kmdbInfo?.director ?? info.director;
  const castRaw = kmdbInfo?.cast && kmdbInfo.cast.length > 0 ? kmdbInfo.cast : info.cast;
  const castToShow = castRaw.slice(0, DISPLAY_CAST_LIMIT).map(toPersonRef);

  const [director, cast] = await Promise.all([
    withResolvedId(toPersonRef(directorRaw), "감독"),
    Promise.all(castToShow.map((member) => withResolvedId(member, "배우"))),
  ]);

  const meta: MovieMeta = {
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
  };

  const data = {
    title: meta.movieTitle,
    posterUrl: meta.posterUrl,
    overview: meta.description,
    releaseDate: meta.releaseDate,
    rereleaseDate: meta.rereleaseDate,
    runtimeMinutes: meta.runtimeMinutes,
    directorName: meta.director?.name ?? null,
    directorKmdbId: meta.director?.kmdbId ?? null,
    cast: meta.cast,
  };
  await db.cachedMovie.upsert({
    where: { movieCd },
    create: { movieCd, ...data },
    update: data,
  });

  return meta;
}

// 캐시에 신선한(TTL 이내) 데이터가 있으면 그대로 쓰고, 없거나 오래됐으면 새로 받아
// 캐시에 채워 넣는다(lazy cache).
async function getMovieMeta(movieCd: string): Promise<MovieMeta | null> {
  const cached = await db.cachedMovie.findUnique({ where: { movieCd } });
  if (cached && Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS) {
    return rowToMeta(cached);
  }
  return fetchAndCacheMovieMeta(movieCd);
}

// 평점 페이지와 항목별 평점 페이지가 공통으로 필요로 하는 영화 정보(포스터/개봉정보/
// 줄거리/감독·출연/박스오피스)를 만든다. 상세정보는 캐시를 거치고, 박스오피스 순위는
// 매일 바뀌는 값이라 캐시 없이 매번 새로 받는다.
export async function resolveMovieRateInfo(id: string): Promise<ResolvedMovieInfo | null> {
  if (!id.startsWith("kobis-")) return null;

  const movieCd = id.slice("kobis-".length);
  const meta = await getMovieMeta(movieCd);
  if (!meta) return null;

  const boxOffice = await getKoficBoxOfficeByTitle(meta.movieTitle);

  return {
    movieId: id,
    ...meta,
    boxOffice,
  };
}
