import { getMovieDetailsByCd, getKoficBoxOfficeByTitle, resolveRerelease, type KoficBoxOffice } from "./kobis";
import { searchKmdbMovie, resolvePersonId, searchKmdbFilmography } from "./kmdb";
import { searchTmdbMovie, resolveTmdbPersonIdByName } from "./tmdb";
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

export type MovieMeta = {
  movieCd: string;
  movieTitle: string;
  description: string;
  posterUrl: string | null;
  gradient: string;
  releaseDate: string | null;
  rereleaseDate: string | null;
  runtimeMinutes: number | null;
  genreAlt: string | null;
  director: PersonRef | null;
  cast: PersonRef[];
  tmdbId: string | null;
  // 포스터/줄거리/장르 등을 최종적으로 어느 소스에서 가져왔는지 —
  // "kmdb": KOFIC+KMDb 조합 | "kmdb_via_tmdb_match": KMDb에 없어 TMDB 매칭으로
  // originalTitle을 얻은 뒤 KMDb를 재검색해 포스터를 찾은 경우.
  source: "kmdb" | "kmdb_via_tmdb_match";
};

export type ResolvedMovieInfo = MovieMeta & {
  movieId: string;
  boxOffice: KoficBoxOffice | null;
};

// KMDb 코드가 없는 인물(영화 자체가 KMDb에 없어서 KOBIS 이름만 있는 경우)에게 이름으로
// 코드를 역조회해서 붙여준다 — 인물 상세 페이지 링크가 이름이 아니라 코드 기반으로
// 들어가야 동명이인 필모그래피가 안 섞인다. 지금 이 사람을 찾게 된 영화의 개봉연도를
// contextYear로 같이 넘기면, 동명이인이 여럿이어도 활동 시기가 맞는 쪽으로 좁혀볼 수 있다.
//
// mapping이 가리키는 kmdbId가 실제로 이 영화 시기에 활동했을 법한지 확인한다. "박정민",
// "안재홍"처럼 흔한 이름은 완전히 무관한 옛날 영화(예: 1967년작)의 KOBIS 캐스트에도
// 같은 이름의(하지만 다른 사람인) 배우가 등장할 수 있는데, 이런 경우까지 매핑을 그대로
// 적용하면 그 무관한 영화가 매핑 대상 인물의 필모그래피에 영구히 섞여 들어간다
// (실제로 "너와 나"(1967)가 박정민(00045706) 필모그래피에 잘못 섞여 들어간 사례로 확인됨).
// resolvePersonId와 같은 방식(활동연도 범위 ±2년)으로, 근거(연도)가 없으면 막지 않고
// 이전처럼 매핑을 그대로 신뢰한다 — 오탐(false reject)보다 이 명백한 오염 사례를 막는 게 먼저다.
async function isYearPlausibleForMapping(
  name: string,
  kmdbId: string,
  role: "감독" | "배우",
  contextYear: string | null
): Promise<boolean> {
  if (!contextYear) return true;
  const year = Number(contextYear);
  if (Number.isNaN(year)) return true;

  const movies = await searchKmdbFilmography(name, kmdbId, role);
  const years = movies
    .map((m) => (m.prodYear ? Number(m.prodYear) : null))
    .filter((y): y is number => y !== null && !Number.isNaN(y));
  if (years.length === 0) return true;

  return year >= Math.min(...years) - 2 && year <= Math.max(...years) + 2;
}

// PersonIdentityMapping(사람이 직접 확인해서 등록해둔 이름 -> kmdbId)이 있으면 그걸
// 최우선으로 쓴다 — person.kmdbId가 이미 채워져 있어도 그보다 앞선다. KMDb 원본
// 데이터 자체가 credit에 엉뚱한 actorId를 붙여놓는 경우(박정민/황정민 등에서 실제로
// 확인됨)가 있어서, "이미 코드가 있으니 믿는다"보다 "사람이 확인한 값이 있으면
// 그게 항상 맞다"가 더 안전하다. 다만 이 시기(contextYear)에 그 kmdbId가 활동했을
// 법하지 않으면(예: 그 사람이 활동을 시작하기 한참 전 영화) 동명의 다른 사람일
// 가능성이 크므로 매핑을 적용하지 않는다.
async function withResolvedId(
  person: PersonRef | null,
  role: "감독" | "배우",
  contextYear: string | null
): Promise<PersonRef | null> {
  if (!person) return null;

  const mapping = await db.personIdentityMapping.findUnique({
    where: { personName_role: { personName: person.name, role } },
  });
  if (mapping?.kmdbId) {
    const plausible = await isYearPlausibleForMapping(person.name, mapping.kmdbId, role, contextYear);
    if (plausible) return { name: person.name, kmdbId: mapping.kmdbId };
  }

  if (person.kmdbId) return person;
  const kmdbId = await resolvePersonId(person.name, role, contextYear);
  return { name: person.name, kmdbId };
}

// KMDb/KOBIS 어느 쪽 인물 타입이든 kmdbId가 있으면 살리고 없으면 null로 통일한다.
function toPersonRef(person: { name: string; kmdbId?: string | null } | null): PersonRef | null {
  if (!person) return null;
  return { name: person.name, kmdbId: person.kmdbId ?? null };
}

// findMoviesByCastTmdbId(person-filmography.ts) 역방향 조회용으로, 감독/출연진의
// TMDB person_id도 같이 찾아 캐시에 저장해둔다. PersonIdentityMapping.tmdbId(사람이
// 확인한 값)가 있으면 최우선이고, 없으면 이름으로 검색한다(동명이인이면 포기 —
// resolveTmdbPersonIdByName 참고). 화면에 보여주는 PersonRef(name+kmdbId)와는
// 별개로 DB 저장용으로만 쓰인다.
async function resolveTmdbIdForPerson(
  person: PersonRef | null,
  role: "감독" | "배우",
  nameEn: string | null
): Promise<string | null> {
  if (!person) return null;
  const mapping = await db.personIdentityMapping.findUnique({
    where: { personName_role: { personName: person.name, role } },
  });
  if (mapping?.tmdbId) return mapping.tmdbId;
  return resolveTmdbPersonIdByName(person.name, nameEn);
}

// KMDb 쪽 인물 타입(KmdbPersonRef)만 영문 이름(nameEn)을 갖고 있다 — KOBIS 쪽
// 타입(director/cast가 info에서 왔을 때)은 그 필드 자체가 없어서, 있을 때만
// 안전하게 꺼낸다.
function getNameEn(person: { name: string } | null | undefined): string | null {
  if (person && "nameEn" in person) return (person as { nameEn: string | null }).nameEn ?? null;
  return null;
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
    genreAlt: row.genreAlt,
    director: row.directorName ? { name: row.directorName, kmdbId: row.directorKmdbId } : null,
    cast: row.cast as PersonRef[],
    tmdbId: row.tmdbId,
    source: row.source === "kmdb_via_tmdb_match" ? "kmdb_via_tmdb_match" : "kmdb",
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

  // KMDb에 포스터가 없으면 TMDB를 '매칭 보조 도구'로만 쓴다 — TMDB 포스터 URL을
  // 직접 저장하는 게 아니라, TMDB에서 얻은 originalTitle(영문 원제)·개봉연도로
  // KMDb를 재검색해 한국 측 포스터를 찾는다. 재검색에도 포스터가 없으면 null로
  // 남긴다 — TMDB 이미지는 절대 사용하지 않는다.
  let finalPosterUrl = kmdbInfo?.posterUrl ?? null;
  let source: "kmdb" | "kmdb_via_tmdb_match" = "kmdb";
  let tmdbInfo: Awaited<ReturnType<typeof searchTmdbMovie>> = null;

  if (!finalPosterUrl) {
    tmdbInfo = await searchTmdbMovie(info.title, releaseDate?.slice(0, 4) ?? null, info.titleEn);
    if (tmdbInfo?.originalTitle) {
      const yearHintForRetry = tmdbInfo.releaseDate?.slice(0, 4) ?? releaseDate?.slice(0, 4) ?? null;
      const kmdbRetry = await searchKmdbMovie(tmdbInfo.originalTitle, yearHintForRetry);
      if (kmdbRetry?.posterUrl) {
        finalPosterUrl = kmdbRetry.posterUrl;
        source = "kmdb_via_tmdb_match";
      }
    }
  }

  const directorRaw = kmdbInfo?.director ?? info.director;
  const castRaw = kmdbInfo?.cast && kmdbInfo.cast.length > 0 ? kmdbInfo.cast : info.cast;
  const castToShow = castRaw.slice(0, DISPLAY_CAST_LIMIT).map(toPersonRef);
  const contextYear = (kmdbInfo?.releaseDate ?? releaseDate)?.slice(0, 4) ?? null;

  const directorRef = toPersonRef(directorRaw);
  const [director, cast, directorTmdbId, castTmdbIds] = await Promise.all([
    withResolvedId(directorRef, "감독", contextYear),
    Promise.all(castToShow.map((member) => withResolvedId(member, "배우", contextYear))),
    resolveTmdbIdForPerson(directorRef, "감독", getNameEn(directorRaw)),
    Promise.all(
      castToShow.map((member, i) => resolveTmdbIdForPerson(member, "배우", getNameEn(castRaw[i])))
    ),
  ]);

  // findMoviesByCastTmdbId 역방향 조회용 — cast는 castToShow와 같은 순서/길이라
  // 인덱스로 castTmdbIds와 그대로 짝지을 수 있다(둘 다 이 시점엔 아직 null 필터링
  // 전). PersonRef(공개 타입)엔 없는 필드라 DB 저장용 배열만 따로 만든다.
  const castForStorage = cast
    .map((c, i) => (c ? { name: c.name, kmdbId: c.kmdbId, tmdbId: castTmdbIds[i] } : null))
    .filter((c): c is { name: string; kmdbId: string | null; tmdbId: string | null } => c !== null);

  const meta: MovieMeta = {
    movieCd: info.movieCd,
    movieTitle: info.title,
    description: kmdbInfo?.overview ?? tmdbInfo?.overview ?? info.overview ?? "아직 등록된 설명이 없어요.",
    posterUrl: finalPosterUrl,
    gradient: FALLBACK_GRADIENT,
    releaseDate: kmdbInfo?.releaseDate ?? tmdbInfo?.releaseDate ?? releaseDate,
    rereleaseDate,
    runtimeMinutes: kmdbInfo?.runtimeMinutes ?? tmdbInfo?.runtimeMinutes ?? info.runtimeMinutes,
    genreAlt: kmdbInfo?.genre ?? tmdbInfo?.genre ?? info.genreAlt,
    director,
    cast: cast.filter((c): c is PersonRef => c !== null),
    tmdbId: tmdbInfo?.tmdbId ?? null,
    source,
  };

  const data = {
    title: meta.movieTitle,
    posterUrl: meta.posterUrl,
    overview: meta.description,
    releaseDate: meta.releaseDate,
    rereleaseDate: meta.rereleaseDate,
    runtimeMinutes: meta.runtimeMinutes,
    genreAlt: meta.genreAlt,
    tmdbId: meta.tmdbId,
    source: meta.source,
    directorName: meta.director?.name ?? null,
    directorKmdbId: meta.director?.kmdbId ?? null,
    directorTmdbId,
    cast: castForStorage,
  };
  await db.cachedMovie.upsert({
    where: { movieCd },
    create: { movieCd, ...data },
    update: data,
  });

  return meta;
}

// 홈 화면 여러 행(최근 영화·올해의 Best·3~5년 Best 등)은 같은 영화를 동시에 포함하는
// 경우가 흔한데, 캐시가 아직 비어 있는 영화면 각 행이 서로 모른 채 동시에 이 함수를
// 불러 "캐시 없네" 판정을 각자 내리고 KMDb에 같은 영화를 중복으로 요청하는 문제가
// 있었다(실제로 같은 제목이 짧은 시간에 여러 번 요청되는 게 확인됨). 지금 진행 중인
// 조회를 movieCd 기준으로 하나만 유지해서, 뒤이어 들어온 호출은 새로 요청하지 않고
// 그 결과를 같이 기다리게 한다.
const inFlightMovieMeta = new Map<string, Promise<MovieMeta | null>>();

// 캐시에 신선한(TTL 이내) 데이터가 있으면 그대로 쓰고, 없거나 오래됐으면 새로 받아
// 캐시에 채워 넣는다(lazy cache). 박스오피스 로우(movie-rows.ts)도 포스터 조회에
// 이 캐시를 그대로 재사용한다 — 인기작은 홈 화면만 봐도 캐시가 데워진다.
export async function getMovieMeta(movieCd: string): Promise<MovieMeta | null> {
  const cached = await db.cachedMovie.findUnique({ where: { movieCd } });
  // source="tmdb"(TMDB 포스터를 직접 저장했던 구 캐시)는 신선도 무관하게 재계산한다 —
  // 이제 TMDB 포스터를 저장하지 않으므로 다음 조회 때 새 로직으로 갱신한다.
  if (cached && cached.source !== "tmdb" && Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS) {
    return rowToMeta(cached);
  }

  const existing = inFlightMovieMeta.get(movieCd);
  if (existing) return existing;

  const promise = fetchAndCacheMovieMeta(movieCd).finally(() => {
    inFlightMovieMeta.delete(movieCd);
  });
  inFlightMovieMeta.set(movieCd, promise);
  return promise;
}

// getMovieMeta를 movieCd 개수만큼 Promise.all로 돌리면, 캐시에 이미 있는 영화라도
// "캐시에 있나?" DB 조회(findUnique)를 영화 한 편당 한 번씩 따로 날린다 — 홈 화면
// 한 행이 영화 20~30편을 보여줄 때마다 20~30번 개별 왕복이 생긴다는 뜻이다. 캐시
// 존재 여부 확인만 먼저 findMany 한 번으로 모아서 하고, 캐시 미스/만료인 것만
// (진행 중인 조회 중복 제거를 그대로 활용해) 실제로 새로 받아온다.
export async function getMovieMetas(movieCds: string[]): Promise<Map<string, MovieMeta | null>> {
  const uniqueCds = Array.from(new Set(movieCds));
  if (uniqueCds.length === 0) return new Map();

  const cachedRows = await db.cachedMovie.findMany({ where: { movieCd: { in: uniqueCds } } });
  const cachedByCd = new Map(cachedRows.map((row) => [row.movieCd, row]));

  const entries = await Promise.all(
    uniqueCds.map(async (movieCd): Promise<[string, MovieMeta | null]> => {
      const cached = cachedByCd.get(movieCd);
      if (cached && cached.source !== "tmdb" && Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS) {
        return [movieCd, rowToMeta(cached)];
      }

      const existing = inFlightMovieMeta.get(movieCd);
      if (existing) return [movieCd, await existing];

      const promise = fetchAndCacheMovieMeta(movieCd).finally(() => {
        inFlightMovieMeta.delete(movieCd);
      });
      inFlightMovieMeta.set(movieCd, promise);
      return [movieCd, await promise];
    })
  );

  return new Map(entries);
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
