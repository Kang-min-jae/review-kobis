import { after } from "next/server";
import { db } from "./db";
import {
  searchMovieCatalog,
  findMovieCdByTitleAndPerson,
  searchKoficPeopleList,
  type KoficPeopleHit,
  type KobisMovieSummary,
} from "./kobis";
import { searchKmdbFilmography } from "./kmdb";
import { getTmdbPersonMovieCredits, resolveTmdbPersonIdByName, searchTmdbPerson } from "./tmdb";
import { isRecentlyOpened, genreFields, summaryToRowMovie, type RowMovie } from "./movie-rows";
import { getMovieMeta, getCachedMovieMetas } from "./movie-rate-info";
import { cdToMovieId } from "./rating-input";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

// TMDB가 "/..." 형태의 상대경로를 돌려주는 경우를 대비해 전체 URL로 보정한다.
function toFullTmdbImageUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("/") ? `${TMDB_IMAGE_BASE}${url}` : url;
}

// 영화 상세정보와 동일하게 3일 — 필모그래피는 신작이 나올 때만 바뀌는 정보라 자주
// 갱신할 필요가 없다.
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3;

// 이 시각 이전에 저장된 필모그래피 캐시는 믿지 않고 한 번 다시 계산한다. 예전엔 검색 API가
// 인물을 "필모그래피 [] "로 미리 저장해두고, 그 빈 기록을 인물 페이지가 신선한 캐시로 믿어
// 사이트에 캐시된 몇 편(역방향 조회)만 보여줬다(예: 황정민 4편). 동명이인이라 TMDB 조회를
// 포기해 최신작이 빠진 채 저장된 캐시도 이때 함께 다시 계산된다.
export const FILMOGRAPHY_VALID_SINCE = Date.parse("2026-09-29T00:00:00Z");

// 처음 보는 인물은 외부 API(KMDb·KOFIC·KOBIS·TMDB)를 여러 번 거쳐야 해서, 이 시간 안에 끝나지
// 않으면 지금까지 찾은 결과로 먼저 보여주고 나머지 계산은 응답 뒤(after)에서 마쳐 캐시한다.
// (예전엔 전부 끝날 때까지 페이지가 멈춰, 출연진 이름을 눌러도 이동하지 않는 것처럼 보였다.)
const FIRST_VIEW_BUDGET_MS = 9000;

// ── 작품 → KOBIS movieCd 찾기 (DB 우선) ────────────────────────────────────
// 예전엔 필모그래피의 작품마다(KMDb·TMDB·KOFIC 합쳐 백여 편) KOBIS에 제목 검색을 보내
// 처음 보는 인물 페이지가 수십 초씩 걸렸다. 사이트에 이미 저장된 영화(CachedMovie)는
// 그 자리에서 코드를 찾을 수 있으니 DB에서 먼저 한 번에 찾고, 못 찾은 작품만 KOBIS에 묻는다.
//  · TMDB id가 같은 KOBIS 영화가 있으면 그 영화(같은 영화임이 확실하다)
//  · 아니면 제목이 같고 개봉연도가 1년 이내인 KOBIS 영화가 정확히 한 편일 때만
type TitleLookup = { title: string; titleEn?: string | null; year?: string | null; tmdbId?: string | null };

async function lookupMovieCdsInDb(items: TitleLookup[]): Promise<(string | null)[]> {
  if (items.length === 0) return [];
  const titles = [...new Set(items.flatMap((i) => [i.title, i.titleEn ?? ""]).filter(Boolean))];
  const tmdbIds = [...new Set(items.map((i) => i.tmdbId).filter((id): id is string => !!id))];
  const rows = await db.cachedMovie.findMany({
    where: { OR: [{ title: { in: titles } }, ...(tmdbIds.length > 0 ? [{ tmdbId: { in: tmdbIds } }] : [])] },
    select: { movieCd: true, title: true, releaseDate: true, tmdbId: true },
  });
  const kobisRows = rows.filter((r) => /^\d+$/.test(r.movieCd));
  const byTmdbId = new Map(kobisRows.filter((r) => r.tmdbId).map((r) => [r.tmdbId!, r.movieCd]));
  const byTitle = new Map<string, typeof kobisRows>();
  for (const row of kobisRows) {
    const key = normalizeTitleForOverlap(row.title);
    byTitle.set(key, [...(byTitle.get(key) ?? []), row]);
  }
  return items.map((item) => {
    if (item.tmdbId && byTmdbId.has(item.tmdbId)) return byTmdbId.get(item.tmdbId)!;
    const year = item.year ? Number(item.year) : NaN;
    for (const title of [item.title, item.titleEn]) {
      if (!title) continue;
      const matches = (byTitle.get(normalizeTitleForOverlap(title)) ?? []).filter((r) => {
        const rowYear = Number(r.releaseDate?.slice(0, 4));
        return Number.isNaN(year) || Number.isNaN(rowYear) || Math.abs(rowYear - year) <= 1;
      });
      if (matches.length === 1) return matches[0].movieCd;
    }
    return null;
  });
}

async function resolveMovieCds(
  items: TitleLookup[],
  personName: string,
  role: "감독" | "배우" | null
): Promise<(string | null)[]> {
  const fromDb: (string | null)[] = await lookupMovieCdsInDb(items).catch(() => items.map(() => null));
  return Promise.all(
    items.map((item, i) =>
      fromDb[i] ? Promise.resolve(fromDb[i]) : findMovieCdByTitleAndPerson(item.title, personName, item.titleEn, role, item.year)
    )
  );
}

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
  const movieCds = await resolveMovieCds(
    movies.map((m) => ({ title: m.title, titleEn: m.titleEng, year: m.prodYear })),
    name,
    role
  );
  const rows = movies.map((movie, i) => {
    const movieCd = movieCds[i];
    // KOBIS 코드가 없는 작품은 kmdb-{docId}로 저장하고, 나중에 평점 페이지에서
    // 제목으로 TMDB를 조회할 수 있도록 CachedMovie에 기본 정보를 남겨둔다.
    if (!movieCd) {
      db.cachedMovie.upsert({
        where: { movieCd: `kmdb-${movie.docId}` },
        create: {
          movieCd: `kmdb-${movie.docId}`,
          title: movie.title,
          titleEn: movie.titleEng,
          overview: movie.overview,
          posterUrl: movie.posterUrl,
          releaseDate: movie.releaseDate,
          rereleaseDate: null,
          runtimeMinutes: movie.runtimeMinutes,
          genreAlt: movie.genre,
          tmdbId: null,
          source: "kmdb",
          directorName: movie.director?.name ?? null,
          directorKmdbId: movie.director?.kmdbId ?? null,
          directorTmdbId: null,
          cast: [] as object[],
        },
        update: {},
      }).catch(() => null);
    }
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
  // 메타(포스터·장르)는 DB 캐시만 읽는다 — 작품마다 외부 API로 영화 정보를 새로 채우면
  // 필모그래피 한 번에 수백 건의 요청이 생겨 페이지가 수십 초씩 멈췄다.
  const metas = await getCachedMovieMetas(candidates.map((c) => c.movieCd));
  return candidates.map((c) => summaryToRowMovie(c, metas.get(c.movieCd) ?? null));
}

function normalizeTitleForOverlap(title: string): string {
  return title
    .replace(/\s*\([^)]*\)/g, "") // strip parentheticals like "(디렉터스 컷)"
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
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
async function filmographyFromKofic(
  name: string,
  knownTitles: Set<string>,
  resolvedTitles: Set<string> // 이미 KOBIS 코드까지 확인된 작품 제목 — 다시 조회하지 않는다
): Promise<RowMovie[]> {
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
  const pending = target.filmoNames.filter((title) => !resolvedTitles.has(normalizeTitleForOverlap(title)));
  const fromDb: (string | null)[] = await lookupMovieCdsInDb(pending.map((title) => ({ title }))).catch(() => pending.map(() => null));
  const dbCds = fromDb.filter((cd): cd is string => cd !== null);
  const exactMatches = await Promise.all(
    pending.map(async (title, i): Promise<KobisMovieSummary | null> => {
      if (fromDb[i]) return null; // DB에서 찾은 작품은 아래에서 따로 카드로 만든다
      const candidates = await searchMovieCatalog({ movieNm: title }, 5);
      return candidates.find((c) => c.title === title) ?? null;
    })
  );
  const found = exactMatches.filter((m): m is KobisMovieSummary => m !== null);
  const metas = await getCachedMovieMetas([...found.map((m) => m.movieCd), ...dbCds]);
  const dbRows: RowMovie[] = dbCds.flatMap((cd) => {
    const meta = metas.get(cd);
    if (!meta) return [];
    return [{
      id: `kobis-${cd}`,
      title: meta.movieTitle,
      posterUrl: meta.posterUrl,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: isRecentlyOpened(meta.releaseDate),
      releaseDate: meta.releaseDate,
      ...genreFields(meta.genreAlt),
    }];
  });
  return [...found.map((m) => summaryToRowMovie(m, metas.get(m.movieCd) ?? null)), ...dbRows];
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
// TMDB에 같은 이름이 여럿이면(예: "황정민"은 남자 배우와 여자 배우가 둘 다 있다) 예전엔
// 그냥 포기해서, KMDb에 아직 없는 최신작(2025~2026년 작품)이 필모그래피에서 통째로 빠졌다.
// 이제 후보마다 TMDB 참여작을 받아, 이미 KMDb·KOBIS로 확인된 이 사람의 작품(knownTitles)과
// 겹치는 편수로 고른다 — 공유하는 실제 작품이 있다는 건 같은 사람이라는 확실한 근거다
// (filmographyFromKofic과 같은 원칙). 겹침이 가장 많은 후보가 확실히 앞설 때만 채택한다.
const TMDB_NAMESAKE_LIMIT = 5;

async function resolveTmdbPersonId(
  name: string,
  nameEn: string | null,
  role: "감독" | "배우" | null,
  knownTitles: Set<string>,
  earlyUnique: Promise<string | null> | null = null
): Promise<string | null> {
  // 이름만으로 한 명이 특정되는지는 KMDb 단계와 동시에 미리 물어봐 둔다(earlyUnique).
  const unique = await (earlyUnique ?? resolveTmdbPersonIdByName(name, nameEn));
  if (unique || knownTitles.size === 0) return unique;

  const sameName = (await searchTmdbPerson(name)).filter((c) => c.name === name).slice(0, TMDB_NAMESAKE_LIMIT);
  if (sameName.length < 2) return null;
  const scored = await Promise.all(
    sameName.map(async (c) => {
      const credits = await getTmdbPersonMovieCredits(c.tmdbId, role);
      const overlap = credits.filter(
        (m) =>
          knownTitles.has(normalizeTitleForOverlap(m.title)) ||
          (m.originalTitle !== null && knownTitles.has(normalizeTitleForOverlap(m.originalTitle)))
      ).length;
      return { tmdbId: c.tmdbId, overlap };
    })
  );
  scored.sort((a, b) => b.overlap - a.overlap);
  const [best, second] = scored;
  const runnerUp = second?.overlap ?? 0;
  if (best.overlap >= 2 && best.overlap > runnerUp) return best.tmdbId;
  if (best.overlap === 1 && runnerUp === 0) return best.tmdbId;
  return null;
}

async function filmographyFromTmdb(
  name: string,
  role: "감독" | "배우" | null,
  knownTmdbId: string | null,
  nameEn: string | null,
  knownTitles: Set<string>,
  earlyUnique: Promise<string | null> | null = null
): Promise<{ rows: RowMovie[]; tmdbId: string | null }> {
  const tmdbId = knownTmdbId ?? (await resolveTmdbPersonId(name, nameEn, role, knownTitles, earlyUnique));
  if (!tmdbId) return { rows: [], tmdbId: null };

  const credits = await getTmdbPersonMovieCredits(tmdbId, role);
  if (credits.length === 0) return { rows: [], tmdbId };

  // KOBIS movieCd를 찾아 KMDb 포스터를 우선 쓰고, KMDb에 없으면 TMDB 포스터로 보완.
  // originalTitle(영문 원제)을 titleEn 힌트로 넘겨 외화에서 KOBIS 매칭 성공률을 높인다.
  const movieCds = await resolveMovieCds(
    credits.map((c) => ({ title: c.title, titleEn: c.originalTitle, year: c.releaseDate?.slice(0, 4), tmdbId: c.tmdbId })),
    name,
    role
  );
  const foundCds = movieCds.filter((cd): cd is string => cd !== null);
  const metas = await getCachedMovieMetas(foundCds);

  const rows = credits.map((c, i) => {
    const movieCd = movieCds[i];
    const meta = movieCd ? (metas.get(movieCd) ?? null) : null;
    return {
      id: movieCd ? `kobis-${movieCd}` : `tmdb-${c.tmdbId}`,
      title: meta?.movieTitle ?? c.title,
      // KMDb 포스터가 없으면(null) TMDB 포스터로 보완 — 외화는 KMDb에 포스터가
      // 없는 경우가 많아서, 이 폴백이 없으면 포스터가 아예 안 나온다.
      // TMDB poster_path가 상대경로("/...")로 들어오는 경우를 대비해 전체 URL로 보정한다.
      posterUrl: meta?.posterUrl ?? toFullTmdbImageUrl(c.posterUrl),
      gradient: FALLBACK_GRADIENT,
      isNowShowing: movieCd ? isRecentlyOpened(c.releaseDate) : false,
      releaseDate: meta?.releaseDate ?? c.releaseDate,
      ...genreFields(meta?.genreAlt ?? null),
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
  return findMoviesByPersonCode("kmdb", kmdbId, role);
}

// 예전엔 CachedMovie 전체(수천 행, 출연진 JSON·줄거리 포함)를 매번 통째로 읽어 와 메모리에서
// 걸렀다 — 인물 페이지를 열 때마다 이 전체 스캔이 두 번씩 일어나 느려졌다. 이제 DB 안에서
// jsonb 포함 연산(@>)으로 이 코드가 있는 행만 가져온다.
async function findMoviesByPersonCode(
  kind: "kmdb" | "tmdb",
  code: string,
  role: "감독" | "배우" | null
): Promise<RowMovie[]> {
  const checkCast = role !== "감독";
  const checkDirector = role !== "배우";
  const castKey = kind === "kmdb" ? "kmdbId" : "tmdbId";
  const rows = await db.$queryRaw<{ movieCd: string; title: string; posterUrl: string | null; releaseDate: string | null; genreAlt: string | null }[]>`
    SELECT "movieCd", "title", "posterUrl", "releaseDate", "genreAlt"
    FROM "CachedMovie"
    WHERE (${checkDirector} AND (CASE WHEN ${kind} = 'kmdb' THEN "directorKmdbId" ELSE "directorTmdbId" END) = ${code})
       OR (${checkCast} AND "cast" @> jsonb_build_array(jsonb_build_object(${castKey}::text, ${code}::text)))
  `;

  return rows.map((row) => ({
    // 숫자 KOBIS 코드만 "kobis-"를 붙인다(tmdb-*·kmdb-* 영화에 붙이면 평점 페이지가 깨진다).
    id: cdToMovieId(row.movieCd),
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
export async function findMoviesByCastTmdbId(
  tmdbId: string,
  role: "감독" | "배우" | null
): Promise<RowMovie[]> {
  return findMoviesByPersonCode("tmdb", tmdbId, role);
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
  const previous = personId ? await db.cachedPerson.findUnique({ where: { kmdbId: personId } }) : null;
  const cachedNameEn = previous?.nameEn ?? null;

  // 외부 API 하나가 실패해도(시간 초과·일시 오류) 페이지 전체가 오류로 끝나지 않게, 소스마다
  // 따로 실패를 받아 빈 결과로 대신하고 실패 여부만 기록한다(아래 캐시 저장 판단에 쓴다).
  let sourceFailed = false;
  const safe = <T,>(label: string, promise: Promise<T>, fallback: T): Promise<T> =>
    promise.catch((error) => {
      sourceFailed = true;
      console.warn(`[filmography] ${name} ${label} 조회 실패:`, error);
      return fallback;
    });

  // TMDB 인물 검색(이름만으로 한 명이 특정되는지)은 KMDb 결과를 기다릴 필요가 없어 1단계와
  // 동시에 시작한다. 동명이인이라 겹침 비교가 필요할 때만 1단계 결과(knownTitles)를 쓴다.
  const earlyTmdbUnique = tmdbIdHint
    ? null
    : resolveTmdbPersonIdByName(name, cachedNameEn).catch(() => null);

  const [kmdbResult, kobisDirectorRows, reverseRows] = await Promise.all([
    safe("KMDb", filmographyFromKmdb(name, personId, role, cachedNameEn), { rows: [] as RowMovie[], nameEn: null }),
    shouldSearchKobisDirector ? safe("KOBIS 감독", filmographyFromKobisDirector(name), [] as RowMovie[]) : Promise.resolve([] as RowMovie[]),
    // kmdbId가 확정돼 있을 때만 가능하다 — 이름 검색이 아니라 kmdbId 값 자체를
    // 비교하는 방식이라, 애초에 비교할 kmdbId가 없으면 쓸 수 없다.
    personId ? safe("역방향(KMDb)", findMoviesByCastKmdbId(personId, role), [] as RowMovie[]) : Promise.resolve([] as RowMovie[]),
  ]);
  const kmdbRows = kmdbResult.rows;
  // 이 사람의 것으로 확인된 작품 제목 — KOFIC·TMDB 동명이인 구분의 근거가 된다.
  const knownTitles = new Set(
    [...kmdbRows, ...kobisDirectorRows, ...reverseRows].map((r) => normalizeTitleForOverlap(r.title))
  );
  const resolvedTitles = new Set(
    [...kmdbRows, ...kobisDirectorRows, ...reverseRows]
      .filter((r) => r.id.startsWith("kobis-"))
      .map((r) => normalizeTitleForOverlap(r.title))
  );
  // KMDb에서 추출했거나 이전 캐시에 저장된 영문 이름 중 더 확실한 쪽을 쓴다.
  const nameEn = kmdbResult.nameEn ?? cachedNameEn;
  const [koficRows, tmdbReverseRows, tmdbResult] = await Promise.all([
    safe("KOFIC", filmographyFromKofic(name, knownTitles, resolvedTitles), [] as RowMovie[]),
    // tmdbIdHint가 확정돼 있을 때만 가능하다 — findMoviesByCastKmdbId와 같은 원리를
    // TMDB person_id 기준으로도 한다.
    tmdbIdHint ? safe("역방향(TMDB)", findMoviesByCastTmdbId(tmdbIdHint, role), [] as RowMovie[]) : Promise.resolve([] as RowMovie[]),
    // nameEn: 톰 홀랜드·맷 데이먼 같은 외국 인물은 TMDB에 영문 본명으로만
    // 등록돼 있어서, 한글 이름 검색이 실패하면 이 영문 이름으로 재시도한다.
    safe(
      "TMDB",
      // KMDb에서 영문 이름을 새로 알아냈으면 그 이름까지 넣어 다시 물어야 하므로 미리 받은 결과는 쓰지 않는다.
      filmographyFromTmdb(name, role, tmdbIdHint, nameEn, knownTitles, nameEn === cachedNameEn ? earlyTmdbUnique : null),
      { rows: [] as RowMovie[], tmdbId: null }
    ),
  ]);

  // 모든 소스를 통합할 때 제목 기준 중복을 제거한다. 같은 영화가 소스마다 다른
  // id 체계(kobis-*/tmdb-*/kmdb-*)와 다른 표기("미스터 & 미세스 스미스" vs
  // "미스터 미세스 스미스")로 들어오는 경우가 있어서, id 비교만으로는 중복을
  // 걸러낼 수 없다. 우선순위 kobis- > tmdb- > kmdb- 순으로 더 ratable한 항목을
  // 유지하고, 동일 우선순위면 기존 항목을 유지하면서 포스터만 보완한다.
  function rowPriority(id: string): number {
    if (id.startsWith("kobis-")) return 2;
    if (id.startsWith("tmdb-") && !id.startsWith("tmdb-tv-")) return 1;
    return 0; // kmdb-*
  }

  const byId = new Map<string, RowMovie>();
  const titleToId = new Map<string, string>(); // normalized title → id in byId

  function mergeRow(row: RowMovie) {
    const norm = normalizeTitleForOverlap(row.title);
    if (byId.has(row.id)) {
      const ex = byId.get(row.id)!;
      if (!ex.posterUrl && row.posterUrl) byId.set(row.id, { ...ex, posterUrl: row.posterUrl });
      return;
    }
    const existingId = titleToId.get(norm);
    if (existingId !== undefined) {
      const existing = byId.get(existingId)!;
      if (rowPriority(row.id) > rowPriority(existingId)) {
        // 더 ratable한 항목으로 교체하되 포스터는 있는 쪽 우선
        byId.delete(existingId);
        byId.set(row.id, { ...row, posterUrl: row.posterUrl ?? existing.posterUrl });
        titleToId.set(norm, row.id);
      } else if (!existing.posterUrl && row.posterUrl) {
        byId.set(existingId, { ...existing, posterUrl: row.posterUrl });
      }
      return;
    }
    byId.set(row.id, row);
    titleToId.set(norm, row.id);
  }

  for (const row of kmdbRows) mergeRow(row);
  for (const row of kobisDirectorRows) mergeRow(row);
  for (const row of koficRows) mergeRow(row);
  for (const row of reverseRows) mergeRow(row);
  for (const row of tmdbReverseRows) mergeRow(row);
  for (const row of tmdbResult.rows) mergeRow(row);

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

  // 일부 소스가 실패했으면 이번 결과는 불완전하다 — 예전에 제대로 계산해 둔 작품이 이번에
  // 빠졌다고 캐시에서 지워지지 않게, 이전 필모그래피 중 이번에 없는 작품을 이어 붙인다.
  const previousRows = isValidFilmographyCache(previous) ? (previous!.filmography as RowMovie[]) : [];
  if (sourceFailed && previousRows.length > 0) {
    const ids = new Set(movies.map((m) => m.id));
    const titles = new Set(movies.map((m) => normalizeTitleForOverlap(m.title)));
    for (const row of previousRows) {
      if (!ids.has(row.id) && !titles.has(normalizeTitleForOverlap(row.title))) movies.push(row);
    }
  }

  // personId(KMDb 인물 코드)가 있을 때만 캐시할 수 있다 — 이름만으로는 동명이인과
  // 캐시 키가 겹쳐서 저장할 수 없다. tmdbId도 한 번 찾으면 같이 저장해서, 캐시가
  // 만료돼 다시 계산할 때 TMDB를 이름으로 재검색하지 않고 바로 재사용한다.
  // 찾은 작품이 하나도 없으면 저장하지 않는다(빈 결과가 "신선한 캐시"로 굳지 않게).
  const tmdbId = tmdbResult.tmdbId ?? tmdbIdHint ?? previous?.tmdbId ?? null;
  if (personId && movies.length > 0) {
    await db.cachedPerson.upsert({
      where: { kmdbId: personId },
      create: { kmdbId: personId, name, role: role ?? "배우", filmography: movies, tmdbId, nameEn },
      update: { name, role: role ?? "배우", filmography: movies, tmdbId, nameEn },
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

// 응답 뒤에 이어서 할 작업 — 요청 밖(관리 스크립트 등)에서 불리면 after()를 쓸 수 없으니
// 그냥 백그라운드로 돌린다.
function runAfterResponse(task: () => Promise<unknown>) {
  try {
    after(task);
  } catch {
    void task().catch(() => undefined);
  }
}

type CachedPersonRow = Awaited<ReturnType<typeof db.cachedPerson.findUnique>>;

// 실제로 계산해서 저장한 필모그래피인가 — 검색 API가 미리 만들어 둔 빈 행([])이나
// FILMOGRAPHY_VALID_SINCE 이전(불완전할 수 있는 예전 로직)의 결과는 캐시로 보지 않는다.
function isValidFilmographyCache(cached: CachedPersonRow): boolean {
  return (
    !!cached &&
    Array.isArray(cached.filmography) &&
    cached.filmography.length > 0 &&
    cached.updatedAt.getTime() >= FILMOGRAPHY_VALID_SINCE
  );
}

// 캐시가 신선해도, "영화 상세페이지의 캐스트에서 이 사람 이름을 클릭하면 그 영화는
// 반드시 필모그래피에 있어야 한다"는 요구사항은 캐시 TTL과 무관하게 항상 보장돼야
// 한다. 캐시가 만들어진 뒤에 다른 영화 페이지를 봐서 CachedMovie가 새로 채워질
// 수도 있기 때문이다(실제로 이렇게 "족구왕"이 안재홍 필모그래피에서 3일간 누락된
// 사례가 있었다). 이 역방향 조회는 DB만 보는 저렴한 조회라 매번 다시 확인해서 합친다.
async function withLiveReverseRows(
  base: RowMovie[],
  personId: string,
  tmdbId: string | null,
  role: "감독" | "배우" | null
): Promise<RowMovie[]> {
  const [liveReverseRows, liveTmdbReverseRows] = await Promise.all([
    findMoviesByCastKmdbId(personId, role).catch(() => [] as RowMovie[]),
    tmdbId ? findMoviesByCastTmdbId(tmdbId, role).catch(() => [] as RowMovie[]) : Promise.resolve([] as RowMovie[]),
  ]);
  const byId = new Map(base.map((m) => [m.id, m]));
  const titles = new Set(base.map((m) => normalizeTitleForOverlap(m.title)));
  for (const row of [...liveReverseRows, ...liveTmdbReverseRows]) {
    const title = normalizeTitleForOverlap(row.title);
    if (byId.has(row.id) || titles.has(title)) continue;
    byId.set(row.id, row);
    titles.add(title);
  }
  return Array.from(byId.values());
}

export type PersonFilmographyResult = {
  movies: RowMovie[];
  // 처음 보는 인물이라 계산이 시간 안에 안 끝나 일부만 보여주는 중인지 — 페이지가 안내 문구를 띄운다.
  partial: boolean;
};

// 캐시에 신선한(TTL 이내) 데이터가 있으면 그대로 쓰고, 오래됐으면 일단 이전 결과를 보여주면서
// 응답 뒤(after)에 새로 계산해 캐시를 갱신한다(stale-while-revalidate). 캐시가 없으면 새로
// 계산하되, FIRST_VIEW_BUDGET_MS 안에 안 끝나면 지금까지 확인된 작품으로 먼저 보여주고
// 계산은 응답 뒤에 마저 끝내 캐시에 채운다.
export async function getPersonFilmography(
  name: string,
  personId: string | null,
  role: "감독" | "배우" | null,
  tmdbIdHint: string | null = null
): Promise<PersonFilmographyResult> {
  const cached = personId ? await db.cachedPerson.findUnique({ where: { kmdbId: personId } }) : null;
  const usable = isValidFilmographyCache(cached);

  if (personId && usable) {
    // tmdbId가 아직 없는 캐시는 TMDB 재시도가 가능할 수 있으므로 1시간, 있으면 3일.
    const ttl = cached!.tmdbId ? CACHE_TTL_MS : 1000 * 60 * 60;
    const isFresh = Date.now() - cached!.updatedAt.getTime() < ttl;
    if (!isFresh) {
      runAfterResponse(() =>
        fetchAndCacheFilmography(name, personId, role, cached!.tmdbId ?? tmdbIdHint).catch((error) =>
          console.warn(`[filmography] ${name} 백그라운드 갱신 실패:`, error)
        )
      );
    }
    const movies = await withLiveReverseRows(cached!.filmography as RowMovie[], personId, cached!.tmdbId, role);
    return { movies, partial: false };
  }

  const computing = fetchAndCacheFilmography(name, personId, role, cached?.tmdbId ?? tmdbIdHint);
  const TIMED_OUT = Symbol("timeout");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    computing.catch((error) => {
      console.warn(`[filmography] ${name} 필모그래피 계산 실패:`, error);
      return [] as RowMovie[];
    }),
    new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), FIRST_VIEW_BUDGET_MS);
    }),
  ]);
  clearTimeout(timer);
  if (result !== TIMED_OUT) {
    return { movies: personId ? await withLiveReverseRows(result, personId, null, role) : result, partial: false };
  }

  // 시간 안에 못 끝났다 — 계산은 응답 뒤에 마저 끝내 캐시에 저장하고, 지금은 DB에서 바로
  // 확인되는 작품(사이트에 캐시된 영화 중 이 인물 코드가 있는 것)만 먼저 보여준다.
  runAfterResponse(() => computing.catch(() => undefined));
  const quick = personId ? await withLiveReverseRows([], personId, cached?.tmdbId ?? tmdbIdHint, role) : [];
  return { movies: quick, partial: true };
}

// 검색 목록에 인물이 뜨면 필모그래피를 응답 뒤에 미리 계산해 둔다 — 사용자가 그 인물을
// 누를 즈음엔 캐시가 준비돼 있어 바로 열린다. 이미 쓸 수 있는 캐시가 있으면 아무것도 안 한다.
// (캐시가 쓸 만한지만 보면 되므로 필모그래피 JSON은 받아 오지 않는다.)
export async function warmPersonFilmography(name: string, personId: string, role: "감독" | "배우"): Promise<void> {
  const [cached] = await db.$queryRaw<{ tmdbId: string | null; usable: boolean }[]>`
    SELECT "tmdbId",
           (CASE WHEN jsonb_typeof("filmography") = 'array' THEN jsonb_array_length("filmography") > 0 ELSE false END
            AND "updatedAt" >= ${new Date(FILMOGRAPHY_VALID_SINCE)}) AS "usable"
    FROM "CachedPerson" WHERE "kmdbId" = ${personId}
  `;
  if (cached?.usable) return;
  await fetchAndCacheFilmography(name, personId, role, cached?.tmdbId ?? null);
}
