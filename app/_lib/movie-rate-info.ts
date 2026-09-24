import { getMovieDetailsByCd, getKoficBoxOfficeByTitle, resolveRerelease, type KoficBoxOffice } from "./kobis";
import { searchKmdbMovie, resolvePersonId, searchKmdbFilmography } from "./kmdb";
import { searchTmdbMovie, resolveTmdbPersonIdByName, getTmdbMovieDetailsById, type TmdbMovieDetails } from "./tmdb";
import { formatPosterUrl } from "./formatPosterUrl";
import { db } from "./db";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

// 평점 페이지에서 화면에 실제로 보여주는 출연진 수(MovieInfoHeader의 DISPLAY_CAST_LIMIT과
// 동일) — 그 이상은 화면에 안 보여서 클릭할 수 없으므로 코드를 역조회할 필요가 없다.
const DISPLAY_CAST_LIMIT = 6;

// 영화 상세정보(포스터/줄거리/감독·출연)는 특정 영화를 볼 때만 필요한 long-tail
// 데이터라 lazy cache로 관리한다 — 이 시간(3일)이 지나면 다음 조회 때 KOBIS+KMDb에서
// 다시 받아와 갱신한다. 박스오피스 수치는 매일 바뀌므로 캐시하지 않고 항상 새로 받는다.
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3;
// 포스터를 못 찾은 레코드는 일시적 API 실패였을 수 있어 더 짧게 두고 재시도한다.
// 0으로 두면 포스터가 원래 없는 영화가 매 요청마다 외부 API 수십 건을 다시 부른다.
const NULL_POSTER_RETRY_MS = 1000 * 60 * 60 * 6;

function isCacheFresh(row: { posterUrl: string | null; updatedAt: Date }): boolean {
  const ttl = row.posterUrl ? CACHE_TTL_MS : NULL_POSTER_RETRY_MS;
  return Date.now() - row.updatedAt.getTime() < ttl;
}

export type PersonRef = { name: string; kmdbId: string | null };

export type MovieMeta = {
  movieCd: string;
  movieTitle: string;
  movieTitleEn: string | null;
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
  // "tmdb": TMDB 포스터를 직접 사용 | "kmdb": KMDb 포스터 사용 |
  // "kmdb_via_tmdb_match": TMDB 원제로 KMDb를 재검색해 포스터를 찾은 경우.
  source: "tmdb" | "kmdb" | "kmdb_via_tmdb_match";
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
    movieTitleEn: row.titleEn ?? null,
    description: row.overview ?? "아직 등록된 설명이 없어요.",
    posterUrl: formatPosterUrl(row.posterUrl),
    gradient: FALLBACK_GRADIENT,
    releaseDate: row.releaseDate,
    rereleaseDate: row.rereleaseDate,
    runtimeMinutes: row.runtimeMinutes,
    genreAlt: row.genreAlt,
    director: row.directorName ? { name: row.directorName, kmdbId: row.directorKmdbId } : null,
    cast: row.cast as PersonRef[],
    tmdbId: row.tmdbId,
    source: row.source === "kmdb_via_tmdb_match" ? "kmdb_via_tmdb_match"
           : row.source === "tmdb" ? "tmdb"
           : "kmdb",
  };
}

// KOBIS+TMDB+KMDb를 조합해 영화 정보를 새로 받아오고, 다음 조회를 위해 캐시에 저장한다.
// TMDB: 포스터·개요·장르·런타임 (1차 소스)
// KMDb: 감독·출연진 한국어 이름 + kmdbId (인물 페이지 라우팅에 필요, 1차 소스)
// KOBIS: 개봉연도·박스오피스·관객수 (항상 KOBIS 원본 사용)
async function fetchAndCacheMovieMeta(movieCd: string): Promise<MovieMeta | null> {
  const info = await getMovieDetailsByCd(movieCd);
  if (!info) return null;

  const { isRerelease, originalReleaseDate } = await resolveRerelease({
    movieCd: info.movieCd,
    title: info.title,
    openDate: info.openDate,
    director: info.director?.name ?? null,
  });
  // 개봉연도는 항상 KOBIS 원본을 쓴다 — 누적 관객수·박스오피스 기준과 일치해야 한다.
  const releaseDate = originalReleaseDate ?? info.openDate;
  const rereleaseDate = isRerelease ? info.openDate : null;

  // TMDB(포스터·개요·장르·런타임)와 KMDb(한국어 감독·출연진+kmdbId)를 병렬 조회한다.
  const [tmdbInfo, kmdbInfo] = await Promise.all([
    searchTmdbMovie(info.title, releaseDate?.slice(0, 4) ?? null, info.titleEn),
    searchKmdbMovie(info.title, releaseDate?.slice(0, 4) ?? null, {
      director: info.director?.name ?? null,
      cast: info.cast.map((c) => c.name),
    }),
  ]);

  // 포스터: TMDB URL 직접 사용 → KMDb 폴백 → null
  let finalPosterUrl = tmdbInfo?.posterUrl ?? kmdbInfo?.posterUrl ?? null;
  let source: "tmdb" | "kmdb" | "kmdb_via_tmdb_match" =
    tmdbInfo?.posterUrl ? "tmdb" : "kmdb";

  // TMDB에도 KMDb에도 포스터가 없으면 TMDB 원제로 KMDb를 재검색한다.
  if (!finalPosterUrl && tmdbInfo?.originalTitle) {
    const yearHintForRetry = tmdbInfo.releaseDate?.slice(0, 4) ?? releaseDate?.slice(0, 4) ?? null;
    const kmdbRetry = await searchKmdbMovie(tmdbInfo.originalTitle, yearHintForRetry);
    if (kmdbRetry?.posterUrl) {
      finalPosterUrl = kmdbRetry.posterUrl;
      source = "kmdb_via_tmdb_match";
    }
  }

  // 감독·출연진: KMDb 한국어 이름 + kmdbId 우선 (인물 페이지 라우팅), KOBIS 폴백
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
    movieTitleEn: info.titleEn ?? tmdbInfo?.originalTitle ?? null,
    // 개요·장르·런타임: TMDB 1차 → KMDb 폴백 → KOBIS
    description: tmdbInfo?.overview ?? kmdbInfo?.overview ?? info.overview ?? "아직 등록된 설명이 없어요.",
    posterUrl: formatPosterUrl(finalPosterUrl),
    gradient: FALLBACK_GRADIENT,
    // 개봉연도: 항상 KOBIS 원본 (KMDb가 다른 연도를 돌려줄 수 있어서 KOBIS 우선)
    releaseDate,
    rereleaseDate,
    runtimeMinutes: tmdbInfo?.runtimeMinutes ?? kmdbInfo?.runtimeMinutes ?? info.runtimeMinutes,
    genreAlt: tmdbInfo?.genre ?? kmdbInfo?.genre ?? info.genreAlt,
    director,
    cast: cast.filter((c): c is PersonRef => c !== null),
    tmdbId: tmdbInfo?.tmdbId ?? null,
    source,
  };

  // TMDB/KMDb 타임아웃·429는 null로 돌아온다 — 그걸 그대로 저장하면 이전에 찾아둔
  // 멀쩡한 포스터가 null로 덮어써진다. 이번에 못 찾았으면 기존 포스터를 유지한다.
  if (!meta.posterUrl) {
    const prev = await db.cachedMovie.findUnique({
      where: { movieCd },
      select: { posterUrl: true, tmdbId: true },
    });
    if (prev?.posterUrl) {
      meta.posterUrl = formatPosterUrl(prev.posterUrl);
      meta.tmdbId = meta.tmdbId ?? prev.tmdbId;
    }
  }

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
  if (cached && isCacheFresh(cached)) {
    // 포스터가 null로 캐시됐지만 tmdbId가 있으면 TTL 만료를 기다리지 않고 즉시 보정한다.
    if (!cached.posterUrl && cached.tmdbId) {
      const details = await getTmdbMovieDetailsById(cached.tmdbId).catch(() => null);
      if (details?.posterUrl) {
        await db.cachedMovie.update({ where: { movieCd }, data: { posterUrl: details.posterUrl } }).catch(() => null);
        return rowToMeta({ ...cached, posterUrl: details.posterUrl });
      }
    }
    return rowToMeta(cached);
  }

  const existing = inFlightMovieMeta.get(movieCd);
  if (existing) return existing;

  // 신선한 데이터 조회 실패 시 만료된 캐시라도 반환해 rate 페이지 404 방지
  const promise = fetchAndCacheMovieMeta(movieCd)
    .catch(() => null)
    .then((meta) => meta ?? (cached ? rowToMeta(cached) : null))
    .finally(() => {
      inFlightMovieMeta.delete(movieCd);
    });
  inFlightMovieMeta.set(movieCd, promise);
  return promise;
}

// 외부 API를 부르지 않고 DB 캐시만 읽는다(만료 여부 무시). 평점 기반 Best 행처럼
// 평점 달린 영화 전체를 한 번에 훑어야 하는 곳에서 getMovieMetas를 쓰면, 만료된
// 영화마다 TMDB/KMDb 재조회(편당 10여 건, 동시 4건 제한)가 줄을 서서 행이 끝나지 않는다.
export async function getCachedMovieMetas(movieCds: string[]): Promise<Map<string, MovieMeta>> {
  const uniqueCds = Array.from(new Set(movieCds));
  if (uniqueCds.length === 0) return new Map();
  const rows = await db.cachedMovie.findMany({ where: { movieCd: { in: uniqueCds } } });
  return new Map(rows.map((row) => [row.movieCd, rowToMeta(row)]));
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
      if (cached && isCacheFresh(cached)) {
        return [movieCd, rowToMeta(cached)];
      }

      const existing = inFlightMovieMeta.get(movieCd);
      if (existing) return [movieCd, await existing];

      // 한 편의 갱신 실패(throw)가 Promise.all 전체를 깨뜨려 홈 화면 행 전체(나아가
      // app/error.tsx로 페이지 전체)를 날리지 않도록, 실패 시 만료된 캐시라도 쓴다.
      const promise = fetchAndCacheMovieMeta(movieCd)
        .catch((error) => {
          console.warn(`[movie-meta] ${movieCd} 갱신 실패`, error);
          return null;
        })
        .then((meta) => meta ?? (cached ? rowToMeta(cached) : null))
        .finally(() => {
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
  // wikidata 수상작 — CachedMovie에서 조회 (award-winners.ts가 홈 화면 렌더 시 미리 저장)
  // award-winners.ts가 링크 id를 "wikidata-{filmQid}-{categoryLabel}" 형태로 만들지만
  // CachedMovie에는 "wikidata-{filmQid}" 형태로 저장되므로 카테고리 접미사를 제거한다.
  if (id.startsWith("wikidata-")) {
    const baseMatch = id.match(/^(wikidata-Q\d+)/);
    const movieCd = baseMatch ? baseMatch[1] : id;
    const cached = await db.cachedMovie.findUnique({ where: { movieCd } }).catch(() => null);
    if (!cached) return null;

    // 개요·개봉일·감독·출연진 중 하나라도 비어 있으면 TMDB+KMDb에서 전체 정보를 보완한다.
    const needsEnrich = !cached.overview || !cached.releaseDate || !cached.directorName ||
      !(Array.isArray(cached.cast) && (cached.cast as unknown[]).length > 0);

    if (needsEnrich) {
      const norm = (s: string | null | undefined) =>
        (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

      // 1) TMDB: tmdbId 직접 조회 → 제목 검증 → 실패하면 제목 검색
      let tmdb: TmdbMovieDetails | null = null;
      let resolvedTmdbId: string | null = cached.tmdbId;
      let tmdbIdWasWrong = false;

      if (cached.tmdbId) {
        const byId = await getTmdbMovieDetailsById(cached.tmdbId).catch(() => null);
        if (byId) {
          const expectedEn = norm(cached.titleEn ?? cached.title);
          const tTitle = norm(byId.title);
          const tOrig = norm(byId.originalTitle);
          const matched =
            expectedEn.length >= 2 &&
            (tTitle.includes(expectedEn) || expectedEn.includes(tTitle) ||
             tOrig.includes(expectedEn) || expectedEn.includes(tOrig));
          if (matched) {
            tmdb = byId;
          } else {
            // 잘못된 P4947 ID — DB에서 제거, 제목 검색으로 대체.
            // tmdbIdWasWrong=true로 표시해서 이 tmdbId에 연결된 posterUrl도 신뢰하지 않는다.
            resolvedTmdbId = null;
            tmdbIdWasWrong = true;
            await db.cachedMovie.update({ where: { movieCd }, data: { tmdbId: null, posterUrl: null } }).catch(() => null);
          }
        }
      }

      if (!tmdb) {
        const displayTitle = cached.titleEn ?? cached.title;
        const yearHint = cached.releaseDate?.slice(0, 4) ?? null;
        const byTitle = await searchTmdbMovie(displayTitle, yearHint, cached.titleEn).catch(() => null);
        if (byTitle) {
          tmdb = byTitle;
          resolvedTmdbId = byTitle.tmdbId ?? resolvedTmdbId;
        }
      }

      // 2) KMDb: 한국어 감독·출연진 조회 (한국 개봉작 위주)
      const displayTitle = cached.title;
      // titleKo 필드가 없을 경우를 대비해 cached.title 사용
      const yearHint = (tmdb?.releaseDate ?? cached.releaseDate)?.slice(0, 4) ?? null;
      const kmdb = await searchKmdbMovie(displayTitle, yearHint, { titleEn: cached.titleEn }).catch(() => null);

      // 3) 감독·출연진 해결
      const directorRaw = kmdb?.director ?? null;
      const castRaw = (kmdb?.cast && kmdb.cast.length > 0 ? kmdb.cast : []).slice(0, DISPLAY_CAST_LIMIT);
      const contextYear = yearHint;

      const directorRef = toPersonRef(directorRaw);
      const castRefs = castRaw.map(toPersonRef);
      const [director, cast] = await Promise.all([
        withResolvedId(directorRef, "감독", contextYear),
        Promise.all(castRefs.map((m) => withResolvedId(m, "배우", contextYear))),
      ]);
      const castForStorage = cast
        .filter((c): c is PersonRef => c !== null)
        .map((c) => ({ name: c.name, kmdbId: c.kmdbId, tmdbId: null }));

      const update = {
        overview: tmdb?.overview ?? kmdb?.overview ?? cached.overview,
        releaseDate: tmdb?.releaseDate ?? kmdb?.releaseDate ?? cached.releaseDate,
        runtimeMinutes: tmdb?.runtimeMinutes ?? kmdb?.runtimeMinutes ?? cached.runtimeMinutes,
        genreAlt: tmdb?.genre ?? kmdb?.genre ?? cached.genreAlt,
        // tmdbId가 잘못된 것으로 확인됐으면 기존 posterUrl도 오염돼 있으므로 사용하지 않는다.
        posterUrl: tmdb?.posterUrl ?? (tmdbIdWasWrong ? null : cached.posterUrl),
        titleEn: tmdb?.originalTitle ?? cached.titleEn,
        tmdbId: resolvedTmdbId,
        directorName: director?.name ?? cached.directorName,
        directorKmdbId: director?.kmdbId ?? cached.directorKmdbId,
        cast: castForStorage.length > 0 ? castForStorage : (cached.cast ?? []),
      };
      await db.cachedMovie.update({ where: { movieCd }, data: update }).catch(() => null);
      return { movieId: id, ...rowToMeta({ ...cached, ...update }), boxOffice: null };
    }

    return { movieId: id, ...rowToMeta(cached), boxOffice: null };
  }

  // TMDB 영화 (KOBIS 코드가 없는 외화) — tmdb-{tmdbId} 형식
  // tmdb-tv-* 시리즈는 series-rate-info.ts에서 따로 처리한다.
  if (id.startsWith("tmdb-") && !id.startsWith("tmdb-tv-")) {
    const tmdbId = id.slice("tmdb-".length);

    const cached = await db.cachedMovie.findUnique({ where: { movieCd: id } }).catch(() => null);
    if (cached && Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS) {
      return { movieId: id, ...rowToMeta(cached), boxOffice: null };
    }

    const details = await getTmdbMovieDetailsById(tmdbId);
    if (!details) return null;

    const data = {
      title: details.title,
      titleEn: details.originalTitle,
      overview: details.overview ?? null,
      posterUrl: details.posterUrl,
      releaseDate: details.releaseDate,
      rereleaseDate: null as string | null,
      runtimeMinutes: details.runtimeMinutes,
      genreAlt: details.genre,
      tmdbId,
      source: "tmdb" as const,
      directorName: null as string | null,
      directorKmdbId: null as string | null,
      directorTmdbId: null as string | null,
      cast: [] as object[],
    };
    await db.cachedMovie.upsert({
      where: { movieCd: id },
      create: { movieCd: id, ...data },
      update: data,
    });

    const meta: MovieMeta = {
      movieCd: id,
      movieTitle: details.title,
      movieTitleEn: details.originalTitle,
      description: details.overview ?? "아직 등록된 설명이 없어요.",
      posterUrl: details.posterUrl,
      gradient: FALLBACK_GRADIENT,
      releaseDate: details.releaseDate,
      rereleaseDate: null,
      runtimeMinutes: details.runtimeMinutes,
      genreAlt: details.genre,
      director: null,
      cast: [],
      tmdbId,
      source: "tmdb",
    };
    return { movieId: id, ...meta, boxOffice: null };
  }

  // KMDb 전용 작품 (KOBIS 코드 없음) — filmographyFromKmdb가 CachedMovie에 기본 정보를
  // 저장해두면 여기서 제목으로 TMDB를 조회해 포스터·개요를 보완한 뒤 평점 페이지를 제공한다.
  if (id.startsWith("kmdb-")) {
    const cached = await db.cachedMovie.findUnique({ where: { movieCd: id } }).catch(() => null);
    if (!cached) return null;

    if (Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS && (cached.overview || cached.posterUrl)) {
      return { movieId: id, ...rowToMeta(cached), boxOffice: null };
    }

    // TMDB에서 제목으로 추가 정보를 가져와 캐시를 보완한다.
    const yearHint = cached.releaseDate?.slice(0, 4) ?? null;
    const tmdb = await searchTmdbMovie(cached.title, yearHint, cached.titleEn).catch(() => null);
    if (tmdb) {
      const update = {
        overview: tmdb.overview ?? cached.overview,
        posterUrl: tmdb.posterUrl ?? cached.posterUrl,
        releaseDate: tmdb.releaseDate ?? cached.releaseDate,
        runtimeMinutes: tmdb.runtimeMinutes ?? cached.runtimeMinutes,
        genreAlt: tmdb.genre ?? cached.genreAlt,
        titleEn: tmdb.originalTitle ?? cached.titleEn,
        tmdbId: tmdb.tmdbId ?? cached.tmdbId,
      };
      await db.cachedMovie.update({ where: { movieCd: id }, data: update }).catch(() => null);
      return { movieId: id, ...rowToMeta({ ...cached, ...update }), boxOffice: null };
    }

    return { movieId: id, ...rowToMeta(cached), boxOffice: null };
  }

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
