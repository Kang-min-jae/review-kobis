import { db } from "./db";
import {
  searchMovieCatalog,
  findMovieCdByTitleAndPerson,
  searchKoficPeopleList,
  type KoficPeopleHit,
  type KobisMovieSummary,
} from "./kobis";
import { searchKmdbFilmography } from "./kmdb";
import { getTmdbPersonMovieCredits, resolveTmdbPersonIdByName } from "./tmdb";
import { isRecentlyOpened, genreFields, summaryToRowMovie, findAwardWinnerMovieCds, type RowMovie } from "./movie-rows";
import { getMovieMeta, getMovieMetas } from "./movie-rate-info";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

// 영화 상세정보와 동일하게 3일 — 필모그래피는 신작이 나올 때만 바뀌는 정보라 자주
// 갱신할 필요가 없다.
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3;

// KMDb에서 이름(+가능하면 인물 코드, 역할)으로 감독/배우 참여작을 찾는다. role을
// 주면 "배우 톰 홀랜드"에 이름만 같은 "감독 톰 홀랜드"의 작품이 섞이는 것을 막을
// 수 있다.
//
// KMDb가 이 kmdbId로 확인해준 작품은 전부 필모그래피에 넣는다 — 검색 자동완성의
// creditCount("N편")와 상세페이지 필모그래피 개수가 반드시 같아야 한다는 요구사항에
// 따른 것이다(둘 다 이제 "이 kmdbId가 그 영화 credit에 있는가" 하나만을 기준으로
// 삼는다). 평점을 남기려면 KOBIS movieCd가 있어야 해서 가능하면 같이 찾아 붙이지만,
// KOBIS에 없는(미개봉/해외 단독 공개 등) 작품이라고 목록에서 빼지는 않는다 — 그런
// 작품은 movieCd 없이(id를 kmdb-<DOCID>로) 넣고, 카드에서 "평점 준비중"으로 표시해
// 평점 등록만 못 하게 한다.
async function filmographyFromKmdb(
  name: string,
  personId: string | null,
  role: "감독" | "배우" | null,
  hintNameEn: string | null = null
): Promise<{ rows: RowMovie[]; nameEn: string | null }> {
  const movies = await searchKmdbFilmography(name, personId, role, hintNameEn);
  if (movies.length === 0) return { rows: [], nameEn: null };

  // 톰 홀랜드·맷 데이먼 같은 외국 배우의 영문 본명(nameEn)을 여기서 뽑아둔다 —
  // TMDB엔 본명으로만 등록돼 있어서, 한글 이름 검색만으론 못 찾는 경우가 많다
  // (filmographyFromTmdb에서 한글로 못 찾으면 이 이름으로 재시도한다). personId가
  // 있으면 그 코드로 정확히 일치하는 credit에서, 없으면 이름이 일치하는 credit에서
  // 찾는다 — 이미 searchKmdbFilmography가 이 필모그래피 자체를 신뢰할 근거로
  // 확인해준 데이터라 별도 검증 없이 그대로 쓴다.
  // 한글 이름 검색 결과에서 영문 이름을 추출 — 없으면 힌트(캐시에 저장된 값)를 그대로 쓴다.
  let nameEn: string | null = hintNameEn;
  for (const movie of movies) {
    const person =
      role === "감독"
        ? movie.director
        : (movie.cast.find((c) => (personId ? c.kmdbId === personId : c.name === name)) ?? null);
    const matches = role === "감독" ? (personId ? person?.kmdbId === personId : person?.name === name) : !!person;
    if (matches && person?.nameEn) {
      nameEn = person.nameEn;
      break;
    }
  }

  // 한글 제목으로 KOBIS에서 못 찾으면 영문 제목으로 재시도한다 — 외화는 KMDb와 KOBIS의
  // 한글 번역 표기가 다른 경우가 흔하다. 제목이 같은 동명이인 영화(예: "컨택트")가
  // 여럿이면 실제 출연진에 이 사람 이름이 있는 쪽만 채택한다 — 못 찾으면(null) 그냥
  // KOBIS 연결 없이 넣는다(작품 자체를 빼지는 않는다).
  const movieCds = await Promise.all(
    movies.map((m) => findMovieCdByTitleAndPerson(m.title, name, m.titleEng, role, m.prodYear))
  );
  const rows = movies.map((movie, i) => {
    const movieCd = movieCds[i];
    return {
      id: movieCd ? `kobis-${movieCd}` : `kmdb-${movie.docId}`,
      title: movie.title,
      posterUrl: movie.posterUrl,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: movieCd ? isRecentlyOpened(movie.releaseDate) : false,
      releaseDate: movie.releaseDate,
      ...genreFields(movie.genre),
    };
  });
  return { rows, nameEn };
}

// KOBIS searchMovieList의 directorNm으로 감독 재검색 (배우 이름으로는 필터링 불가 —
// 배우일 경우 그냥 빈 배열이 온다). KMDb 검색은 전문(full-text) 검색이라 특정 인물의
// 작품을 다 못 찾는 경우가 있어서, KMDb 결과가 있어도 항상 같이 돌려서 합친다 —
// KOBIS의 정확한 감독명 필터가 KMDb에서 누락된 작품을 채워준다.
async function filmographyFromKobisDirector(name: string): Promise<RowMovie[]> {
  const candidates = await searchMovieCatalog({ directorNm: name }, 30);
  const metas = await getMovieMetas(candidates.map((c) => c.movieCd));
  return candidates.map((c) => summaryToRowMovie(c, metas.get(c.movieCd) ?? null));
}

function normalizeTitleForOverlap(title: string): string {
  return title.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

// KMDb의 전문검색(rawSearch)은 관련도 기반이라, credit이 있는데도 검색 결과 100건
// 안에 아예 안 걸리는 작품이 있을 수 있다("파수꾼"에 실제로 출연한 박정민이 KMDb
// 이름 검색만으로는 안 잡힌 사례로 실제 확인됨). KOFIC의 영화인 목록(peopleCd 기반
// filmoNames, 국내 실제 상영작을 다루는 정부 데이터)을 완전히 독립된 두 번째
// 발견 경로로 같이 써서 이런 누락을 보완한다.
//
// KOFIC peopleCd는 KMDb kmdbId와 매핑되는 값이 아니라서(서로 다른 기관의 별개 코드),
// 여기서도 이름으로 다시 조회한다. "박정민"처럼 흔한 이름은 KOFIC 쪽에도 동명이인이
// 등록돼 있는 경우가 많아서(실제로 이 때문에 "박정민"의 KOFIC 조회가 계속 후보 여럿
// 으로 나와 전부 포기되고 있었다) 이름 하나만 걸리길 기다리지 않는다. 대신 이미
// KMDb로 확인된 이 사람의 실제 필모그래피(knownTitles)와 대표작이 겹치는 후보를
// 찾는다 — 공유하는 실제 작품이 있다는 건 같은 사람이라는 확실한 근거가 된다.
// 후보가 여럿인데 겹치는 후보가 정확히 하나로 좁혀지지 않으면(모르면) 포기한다.
async function filmographyFromKofic(name: string, knownTitles: Set<string>): Promise<RowMovie[]> {
  const koficHits = await searchKoficPeopleList(name);
  const sameName = koficHits.filter((h) => h.name === name);

  let target: KoficPeopleHit | null = null;
  if (sameName.length === 1) {
    target = sameName[0];
  } else if (sameName.length > 1 && knownTitles.size > 0) {
    const withOverlap = sameName.filter((h) =>
      h.filmoNames.some((title) => knownTitles.has(normalizeTitleForOverlap(title)))
    );
    if (withOverlap.length === 1) target = withOverlap[0];
  }
  if (!target) return [];

  // 제목별 KOBIS 조회(movieCd를 알아내는 단계)는 제목마다 따로 해야 하지만, 그 뒤
  // 메타 조회는 한 번에 배치로 묶어서 필모그래피 편수만큼 DB 왕복이 생기지 않게 한다.
  const exactMatches = await Promise.all(
    target.filmoNames.map(async (title): Promise<KobisMovieSummary | null> => {
      const candidates = await searchMovieCatalog({ movieNm: title }, 5);
      return candidates.find((c) => c.title === title) ?? null;
    })
  );
  const found = exactMatches.filter((m): m is KobisMovieSummary => m !== null);
  const metas = await getMovieMetas(found.map((m) => m.movieCd));
  return found.map((m) => summaryToRowMovie(m, metas.get(m.movieCd) ?? null));
}

// KMDb의 이름 텍스트검색(searchKmdbFilmography)은 관련도순 검색이라, 활동이 많은
// 인물일수록 credit이 있는데도 결과 안에 아예 안 걸리는 작품이 생길 수 있다.
// TMDB는 person_id 하나로 이 사람의 "전체" 참여작을 한 번에 돌려주는 전용
// 엔드포인트가 있어서(movie_credits), 이 구조적 누락을 근본적으로 보완할 수 있다.
//
// 다만 TMDB person_id를 이름만으로 새로 찾아야 하는 경우엔(아직 확정된 매핑이
// 없을 때), 동명이인이 있으면 어느 쪽이 이 사람인지 확인할 방법이 없다 — 그래서
// 검색 결과가 정확히 1명으로 좁혀질 때만 채택하고, 여럿이면 근거 없이 아무나
// 고르느니 그냥 포기한다(이 코드베이스의 다른 동명이인 처리와 같은 원칙).
// PersonIdentityMapping.tmdbId나 CachedPerson.tmdbId로 이미 확정/캐시된 값이
// 있으면 그건 항상 신뢰한다(사람이 확인했거나 과거에 이미 이 로직을 통과한 값).
async function filmographyFromTmdb(
  name: string,
  role: "감독" | "배우" | null,
  knownTmdbId: string | null,
  nameEn: string | null
): Promise<{ rows: RowMovie[]; tmdbId: string | null }> {
  const tmdbId = knownTmdbId ?? (await resolveTmdbPersonIdByName(name, nameEn));
  if (!tmdbId) return { rows: [], tmdbId: null };

  const credits = await getTmdbPersonMovieCredits(tmdbId, role);
  if (credits.length === 0) return { rows: [], tmdbId };

  // KOBIS movieCd를 찾아 KOFIC/KMDb 포스터를 가져온다 — TMDB 포스터 URL은 절대
  // 사용하지 않는다. originalTitle(영문 원제)을 titleEn 힌트로 넘겨 외화에서
  // KOBIS 매칭 성공률을 높인다.
  const movieCds = await Promise.all(
    credits.map((c) => findMovieCdByTitleAndPerson(c.title, name, c.originalTitle, role, c.releaseDate?.slice(0, 4)))
  );
  const foundCds = movieCds.filter((cd): cd is string => cd !== null);
  const metas = await getMovieMetas(foundCds);

  const rows = credits.map((c, i) => {
    const movieCd = movieCds[i];
    const meta = movieCd ? (metas.get(movieCd) ?? null) : null;
    return {
      id: movieCd ? `kobis-${movieCd}` : `tmdb-${c.tmdbId}`,
      title: meta?.movieTitle ?? c.title,
      posterUrl: meta?.posterUrl ?? null,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: movieCd ? isRecentlyOpened(c.releaseDate) : false,
      releaseDate: meta?.releaseDate ?? c.releaseDate,
    };
  });
  return { rows, tmdbId };
}

// 지금까지의 발견 경로(KMDb 이름 검색, KOFIC 영화인 목록)는 전부 "이 이름으로
// 검색했을 때 걸리는가"에 의존한다 — 검색 결과 개수 제한이나 KOFIC filmoNames의
// 불완전성 때문에 실제 credit이 있어도 못 찾는 사각지대가 생긴다("파수꾼"에 실제로
// 출연한 박정민이 두 경로 모두에서 안 걸린 사례로 확인됨).
//
// 이 함수는 반대 방향으로 접근한다 — 이름이 아니라, 우리 CachedMovie(영화 상세정보
// lazy cache, 영화 페이지를 한 번이라도 봐서 캐싱된 것)에 이미 저장된 모든 영화의
// cast/directorKmdbId를 훑어서 정확히 이 kmdbId가 있는 영화를 찾는다. 이름 매칭이
// 아니라 kmdbId 값 자체를 비교하는 거라 동명이인 오염 위험이 전혀 없다.
//
// 한계: 우리가 이미 한 번이라도 조회해서 캐싱해둔 영화 안에서만 찾을 수 있다 —
// 사이트에서 한 번도 안 열어본 영화는 여기서도 못 찾는다. CachedMovie 커버리지가
// 넓어질수록(사람들이 여러 영화 페이지를 볼수록) 이 경로의 효과도 자연히 커진다.
export async function findMoviesByCastKmdbId(
  kmdbId: string,
  role: "감독" | "배우" | null
): Promise<RowMovie[]> {
  const checkCast = role !== "감독";
  const checkDirector = role !== "배우";

  const rows = await db.cachedMovie.findMany();
  const matched = rows.filter((row) => {
    if (checkDirector && row.directorKmdbId === kmdbId) return true;
    if (checkCast) {
      const cast = row.cast as { name: string; kmdbId: string | null }[];
      return cast.some((c) => c.kmdbId === kmdbId);
    }
    return false;
  });

  return matched.map((row) => ({
    id: `kobis-${row.movieCd}`,
    title: row.title,
    posterUrl: row.posterUrl,
    gradient: FALLBACK_GRADIENT,
    isNowShowing: isRecentlyOpened(row.releaseDate),
    releaseDate: row.releaseDate,
    ...genreFields(row.genreAlt),
  }));
}

// findMoviesByCastKmdbId와 완전히 같은 원리의 역방향 조회를 TMDB person_id
// 기준으로도 한다 — movie-rate-info.ts가 영화를 캐싱할 때 감독/출연진의 TMDB
// person_id도 같이 찾아 CachedMovie.directorTmdbId/cast[].tmdbId에 저장해두므로,
// 이름 매칭이 아니라 코드 값 자체를 비교해 동명이인 오염 위험 없이 찾을 수 있다.
// tmdbId를 아직 못 찾은 경우(동명이인이라 포기했거나 이 인물이 처음 조회되는
// 경우)엔 호출하는 쪽에서 아예 부르지 않는다.
export async function findMoviesByCastTmdbId(
  tmdbId: string,
  role: "감독" | "배우" | null
): Promise<RowMovie[]> {
  const checkCast = role !== "감독";
  const checkDirector = role !== "배우";

  const rows = await db.cachedMovie.findMany();
  const matched = rows.filter((row) => {
    if (checkDirector && row.directorTmdbId === tmdbId) return true;
    if (checkCast) {
      const cast = row.cast as { name: string; kmdbId: string | null; tmdbId?: string | null }[];
      return cast.some((c) => c.tmdbId === tmdbId);
    }
    return false;
  });

  return matched.map((row) => ({
    id: `kobis-${row.movieCd}`,
    title: row.title,
    posterUrl: row.posterUrl,
    gradient: FALLBACK_GRADIENT,
    isNowShowing: isRecentlyOpened(row.releaseDate),
    releaseDate: row.releaseDate,
    ...genreFields(row.genreAlt),
  }));
}

async function fetchAndCacheFilmography(
  name: string,
  personId: string | null,
  role: "감독" | "배우" | null,
  knownTmdbId: string | null = null
): Promise<RowMovie[]> {
  // KOBIS 감독명 검색은 감독만 걸러줄 수 있어서(배우로는 필터링이 안 됨), role이
  // 정확히 "감독"으로 확인된 경우에만 돌린다. role이 없거나("배우"도 "감독"도 아닌
  // 경우, 예: 알 수 없음) 무조건 돌리게 하면(예전엔 `role !== "배우"`로 되어 있어
  // role이 null일 때도 실행됐다) 이름만 같은 전혀 다른 감독의 작품이 검증 없이
  // 섞여 들어올 수 있다 — role을 모를 땐 아예 안 돌리는 쪽이 안전하다.
  // 참고: KOBIS엔 인물 코드가 없어서 이 검색 자체가 항상 이름 문자열 매칭이다 —
  // 정말 동명이인 감독이 있으면(진짜 두 사람이 같은 이름을 씀) 이 경로는 원천적으로
  // 구분할 방법이 없다는 한계는 남아있다.
  const shouldSearchKobisDirector = role === "감독";

  // 사람이 직접 확인해서 등록해둔 매핑(PersonIdentityMapping.tmdbId)이 있으면
  // CachedPerson에 저장된 값보다도 그걸 최우선으로 쓴다 — 이름 기반 자동 검색보다
  // 항상 더 신뢰할 수 있다(kmdbId 매핑과 같은 원칙).
  let tmdbIdHint = knownTmdbId;
  if (role) {
    const mapping = await db.personIdentityMapping.findUnique({
      where: { personName_role: { personName: name, role } },
    });
    if (mapping?.tmdbId) tmdbIdHint = mapping.tmdbId;
  }

  // KOFIC 쪽 동명이인을 구분하려면(filmographyFromKofic 참고) KMDb로 이미 확인된
  // 제목이 먼저 있어야 해서, KMDb/KOBIS 감독 검색을 먼저 끝내고 그 결과로 KOFIC을 돈다.
  // 이전 캐시에 저장된 nameEn을 힌트로 넘겨 KMDb도 영문 이름으로 재검색하게 한다.
  const cachedNameEn = personId
    ? (await db.cachedPerson.findUnique({ where: { kmdbId: personId }, select: { nameEn: true } }))?.nameEn ?? null
    : null;
  const [kmdbResult, kobisDirectorRows] = await Promise.all([
    filmographyFromKmdb(name, personId, role, cachedNameEn),
    shouldSearchKobisDirector ? filmographyFromKobisDirector(name) : Promise.resolve([]),
  ]);
  const kmdbRows = kmdbResult.rows;
  const knownTitles = new Set(
    [...kmdbRows, ...kobisDirectorRows].map((r) => normalizeTitleForOverlap(r.title))
  );
  // KMDb에서 추출했거나 이전 캐시에 저장된 영문 이름 중 더 확실한 쪽을 쓴다.
  const nameEn = kmdbResult.nameEn ?? cachedNameEn;
  const [koficRows, reverseRows, tmdbReverseRows, tmdbResult] = await Promise.all([
    filmographyFromKofic(name, knownTitles),
    // kmdbId가 확정돼 있을 때만 가능하다 — 이름 검색이 아니라 kmdbId 값 자체를
    // 비교하는 방식이라, 애초에 비교할 kmdbId가 없으면 쓸 수 없다.
    personId ? findMoviesByCastKmdbId(personId, role) : Promise.resolve([]),
    // tmdbIdHint가 확정돼 있을 때만 가능하다 — findMoviesByCastKmdbId와 같은 원리를
    // TMDB person_id 기준으로도 한다.
    tmdbIdHint ? findMoviesByCastTmdbId(tmdbIdHint, role) : Promise.resolve([]),
    // nameEn: 톰 홀랜드·맷 데이먼 같은 외국 인물은 TMDB에 영문 본명으로만
    // 등록돼 있어서, 한글 이름 검색이 실패하면 이 영문 이름으로 재시도한다.
    filmographyFromTmdb(name, role, tmdbIdHint, nameEn),
  ]);

  // KMDb는 포스터가 있어 우선하고, KOBIS 감독 검색·KOFIC 영화인 목록·CachedMovie
  // 역방향 조회(kmdbId/tmdbId 둘 다)·TMDB 전체 필모그래피에만 있는 작품(이름
  // 검색에서 누락된 것)을 채워 넣는다.
  const byId = new Map<string, RowMovie>();
  for (const row of kmdbRows) byId.set(row.id, row);
  for (const row of kobisDirectorRows) if (!byId.has(row.id)) byId.set(row.id, row);
  for (const row of koficRows) if (!byId.has(row.id)) byId.set(row.id, row);
  for (const row of reverseRows) if (!byId.has(row.id)) byId.set(row.id, row);
  for (const row of tmdbReverseRows) if (!byId.has(row.id)) byId.set(row.id, row);

  // TMDB 필모그래피는 KOBIS movieCd를 못 찾은 작품이면 id가 tmdb-<id>가 되는데,
  // 같은 영화가 KMDb 쪽에서도 movieCd 없이(kmdb-<docid>) 이미 들어와 있을 수 있다 —
  // id 체계가 서로 달라 id만으로는 이 중복을 못 걸러내므로, 제목으로 한 번 더
  // 대조해서 이미 있는 작품은 건너뛴다.
  const existingTitles = new Set(Array.from(byId.values()).map((r) => normalizeTitleForOverlap(r.title)));
  for (const row of tmdbResult.rows) {
    const normalized = normalizeTitleForOverlap(row.title);
    if (byId.has(row.id) || existingTitles.has(normalized)) continue;
    byId.set(row.id, row);
    existingTitles.add(normalized);
  }
  let movies = Array.from(byId.values());

  // 자동 매칭이 못 잡아내는 예외(주로 KMDb 원본 데이터 자체의 오류)를 사람이 직접
  // 등록해둔 게 있으면 여기서 반영한다 — EXCLUDE는 자동 매칭 결과에서 그 영화를 빼고,
  // INCLUDE는 자동 매칭이 놓친 진짜 참여작을 수동으로 채워 넣는다.
  if (personId) {
    const overrides = await db.personFilmographyOverride.findMany({ where: { personKmdbId: personId } });
    if (overrides.length > 0) {
      const excluded = new Set(overrides.filter((o) => o.action === "EXCLUDE").map((o) => o.movieCd));
      const included = overrides.filter((o) => o.action === "INCLUDE" && !byId.has(`kobis-${o.movieCd}`));

      movies = movies.filter((m) => !excluded.has(m.id.replace(/^kobis-/, "")));

      const includedRows = await Promise.all(
        included.map(async (o): Promise<RowMovie | null> => {
          const meta = await getMovieMeta(o.movieCd);
          if (!meta) return null;
          return {
            id: `kobis-${o.movieCd}`,
            title: meta.movieTitle,
            posterUrl: meta.posterUrl,
            gradient: FALLBACK_GRADIENT,
            isNowShowing: isRecentlyOpened(meta.releaseDate),
            releaseDate: meta.releaseDate,
            ...genreFields(meta.genreAlt),
          };
        })
      );
      movies = [...movies, ...includedRows.filter((r): r is RowMovie => r !== null)];
    }
  }

  // personId(KMDb 인물 코드)가 있을 때만 캐시할 수 있다 — 이름만으로는 동명이인과
  // 캐시 키가 겹쳐서 저장할 수 없다. tmdbId도 한 번 찾으면 같이 저장해서, 캐시가
  // 만료돼 다시 계산할 때 TMDB를 이름으로 재검색하지 않고 바로 재사용한다.
  if (personId) {
    await db.cachedPerson.upsert({
      where: { kmdbId: personId },
      create: { kmdbId: personId, name, role: role ?? "배우", filmography: movies, tmdbId: tmdbResult.tmdbId, nameEn },
      update: { name, role: role ?? "배우", filmography: movies, tmdbId: tmdbResult.tmdbId, nameEn },
    });
  }

  return movies;
}

// 인물 페이지에서 "OOOO년생" 같은 생년월일 참고 정보를 보여줄 때 쓴다 —
// getPersonFilmography가 이미 CachedPerson에 채워놓은 tmdbId를 그대로 재사용하므로
// (getPersonFilmography를 먼저 호출한 뒤에 불러야 한다), 추가 TMDB 검색 없이
// 바로 조회 가능하다.
export async function getPersonTmdbId(personId: string | null): Promise<string | null> {
  if (!personId) return null;
  const cached = await db.cachedPerson.findUnique({ where: { kmdbId: personId }, select: { tmdbId: true } });
  return cached?.tmdbId ?? null;
}

// 캐시에 신선한(TTL 이내) 데이터가 있으면 그대로 쓰고, 없거나 오래됐으면 새로 받아
// 캐시에 채워 넣는다(lazy cache).
export async function getPersonFilmography(
  name: string,
  personId: string | null,
  role: "감독" | "배우" | null
): Promise<RowMovie[]> {
  if (!personId) return enrichWithAwards(await fetchAndCacheFilmography(name, personId, role));

  const cached = await db.cachedPerson.findUnique({ where: { kmdbId: personId } });
  // tmdbId가 아직 없는 캐시는 nameEn이 새로 생겨 TMDB 재시도가 가능할 수 있으므로
  // TTL을 짧게(1시간) 해서 빠르게 갱신되게 한다. tmdbId가 있으면 3일로 충분하다.
  const ttl = cached?.tmdbId ? CACHE_TTL_MS : 1000 * 60 * 60;
  const isFresh = !!cached && Date.now() - cached.updatedAt.getTime() < ttl;
  const base = isFresh
    ? (cached!.filmography as RowMovie[])
    : await fetchAndCacheFilmography(name, personId, role, cached?.tmdbId ?? null);

  // 방금 새로 계산한 결과(!isFresh)엔 findMoviesByCastKmdbId/findMoviesByCastTmdbId가
  // 이미 포함돼 있다.
  if (!isFresh) return enrichWithAwards(base);

  // 캐시가 신선해도, "영화 상세페이지의 캐스트에서 이 사람 이름을 클릭하면 그 영화는
  // 반드시 필모그래피에 있어야 한다"는 요구사항은 캐시 TTL과 무관하게 항상 보장돼야
  // 한다. 캐시가 만들어진 뒤에 다른 영화 페이지를 봐서 CachedMovie가 새로 채워질
  // 수도 있기 때문이다(실제로 이렇게 "족구왕"이 안재홍 필모그래피에서 3일간 누락된
  // 사례가 있었다). 이 역방향 조회는 DB만 스캔하는 저렴한 조회라 캐시 여부와 무관하게
  // 매번 다시 확인해서 합친다.
  const [liveReverseRows, liveTmdbReverseRows] = await Promise.all([
    findMoviesByCastKmdbId(personId, role),
    cached?.tmdbId ? findMoviesByCastTmdbId(cached.tmdbId, role) : Promise.resolve([]),
  ]);
  const byId = new Map(base.map((m) => [m.id, m]));
  for (const row of [...liveReverseRows, ...liveTmdbReverseRows]) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return enrichWithAwards(Array.from(byId.values()));
}

async function enrichWithAwards(movies: RowMovie[]): Promise<RowMovie[]> {
  const kobasCds = movies
    .filter((m) => m.id.startsWith("kobis-"))
    .map((m) => m.id.replace(/^kobis-/, ""));
  if (kobasCds.length === 0) return movies;
  const awardMap = await findAwardWinnerMovieCds(kobasCds);
  if (awardMap.size === 0) return movies;
  return movies.map((m) => {
    const cd = m.id.replace(/^kobis-/, "");
    const awards = awardMap.get(cd);
    return awards ? { ...m, awardBadge: true as const, festivalAwards: awards } : m;
  });
}
