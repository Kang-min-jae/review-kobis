// 영화진흥위원회(KOFIC) KOBIS 오픈API만 사용하는 데이터 레이어.
// TMDB는 더 이상 쓰지 않는다 — 포스터/줄거리/인기도(popularity)/인물 상세처럼
// KOBIS가 아예 제공하지 않는 데이터는 항상 null/빈 값으로 취급하고, 화면은 그 값이
// 없을 때의 대체 표현(그라디언트, 설명 미표시 등)을 그대로 쓴다.
// KOBIS_API_KEY(=KOFIC_API_KEY, kobis.or.kr에서 무료 발급)가 없으면 모든 함수가
// 조용히 빈 값/목록을 반환한다.
//
// 이 API가 다루는 범위는 "국내에 실제로 개봉(수입)된 영화" 전체다 — 한국 영화뿐 아니라
// 극장 개봉한 해외 영화도 포함되고, 개봉 예정작·미개봉작은 openDt가 비어 있어 걸러진다.
//
// 중요한 제약 (TMDB 대비):
//   - 포스터/스틸컷 이미지가 전혀 없다.
//   - 줄거리(시놉시스) 텍스트가 없다 — 장르/등급/출연진 같은 구조화된 정보만 있다.
//   - "인기순" 정렬 기준이 없다 (평점·조회수·popularity 지표 자체가 없음). 그래서 "Best"류
//     행은 개봉일 최신순으로, 실제 흥행 지표가 필요한 곳은 박스오피스(주간 TOP10) 실데이터로 대체한다.
//   - 인물(감독/배우) 상세 API가 없다 — 영화 상세 안에 이름만 존재한다. 인물 페이지는
//     감독명으로 영화 목록을 재검색하는 방식으로 대체한다.

import { unstable_cache } from "next/cache";
import { isAdultContent } from "./adult-content";

const KOBIS_API_BASE = "https://kobis.or.kr/kobisopenapi/webservice/rest";

// fetch 자체엔 기본 타임아웃이 없어서, 연결이 에러 없이 그냥 응답 없이 멈춰버리면
// (이 네트워크에서 실제로 여러 번 있었다) 그 요청을 기다리는 쪽(예: searchMovieCatalog의
// 순차 페이지 루프, Promise.all로 여러 건을 한꺼번에 기다리는 호출)이 영원히 안 끝난다.
// 일정 시간 안에 응답이 없으면 실패로 처리해서 재시도·다음 단계 진행이 되게 한다.
const KOBIS_FETCH_TIMEOUT_MS = 10_000;

function apiKey(): string | null {
  return process.env.KOFIC_API_KEY || null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStamp(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

function normalizeTitle(title: string): string {
  return title.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

// 재개봉작은 KOBIS에 원 개봉 등록과 별도로 "N주년", "리마스터판" 등이 붙은 재개봉
// 등록이 따로 존재하는 경우가 있다. 제목만으로 검색하면 재개봉 등록이 걸릴 수 있어서,
// 이런 수식어를 뗀 원제로 검색해 원 개봉 등록을 우선 찾도록 한다.
const EDITION_SUFFIX_PATTERN =
  /\s*[:：]?\s*(\d+\s*주년(\s*(기념)?\s*(재개봉|특별판)?)?|리마스터(링)?판?|확장판|무삭제판|디렉터스\s*컷|파이널\s*컷|익스텐디드\s*컷|극장판|스페셜\s*에디션|언레이티드판?)\s*$/;

function stripEdition(title: string): string {
  return title.replace(EDITION_SUFFIX_PATTERN, "").trim();
}

// ── 카탈로그 검색 (searchMovieList) ─────────────────────────────────────────

type RawMovieListItem = {
  movieCd?: string;
  movieNm?: string;
  movieNmEn?: string;
  openDt?: string; // "YYYYMMDD" 또는 미개봉 시 빈 문자열
  nationAlt?: string;
  genreAlt?: string;
  repNationNm?: string; // "한국" | "외국"
  directors?: { peopleNm?: string }[];
};

export type KobisMovieSummary = {
  movieCd: string;
  title: string;
  titleEn: string | null;
  openDate: string | null; // ISO yyyy-mm-dd
  nationAlt: string | null;
  genreAlt: string | null;
  isForeign: boolean;
  director: string | null;
};

function toOpenDateIso(openDt: string | undefined): string | null {
  if (!openDt || openDt.length !== 8) return null;
  return `${openDt.slice(0, 4)}-${openDt.slice(4, 6)}-${openDt.slice(6, 8)}`;
}

function toMovieSummary(item: RawMovieListItem): KobisMovieSummary | null {
  if (!item.movieCd || !item.movieNm) return null;
  return {
    movieCd: item.movieCd,
    title: item.movieNm,
    titleEn: item.movieNmEn?.trim() || null,
    openDate: toOpenDateIso(item.openDt),
    nationAlt: item.nationAlt?.trim() || null,
    genreAlt: item.genreAlt?.trim() || null,
    isForeign: item.repNationNm === "외국",
    director: item.directors?.[0]?.peopleNm?.trim() || null,
  };
}

export type CatalogSearchParams = {
  movieNm?: string;
  directorNm?: string;
  openStartDt?: string; // "YYYY" — 연도만 (KOBIS는 개봉일 검색을 연 단위로만 지원한다)
  openEndDt?: string; // "YYYY"
  repNationCd?: "K" | "F";
  // 기본은 개봉 예정작(openDt가 미래인 항목)을 제외한다. 재개봉 예정작 미리보기처럼
  // "앞으로 개봉할 것"을 봐야 하는 곳에서만 true로 넘긴다.
  includeUpcoming?: boolean;
};

// searchMovieList를 필요한 페이지 수만큼 호출해서 모은다 (한 페이지 최대 100개).
// 이미 국내 개봉이 확정된(openDt가 있고 오늘 이전인) 영화만 남기고, 최신 개봉일 순으로 정렬한다.
export async function searchMovieCatalog(
  params: CatalogSearchParams,
  maxResults: number
): Promise<KobisMovieSummary[]> {
  const key = apiKey();
  if (!key) return [];

  const todayStamp = toDateStamp(new Date());
  const pageSize = 100;
  const pagesNeeded = Math.min(Math.ceil(maxResults / pageSize), 5);
  const collected: KobisMovieSummary[] = [];
  const { includeUpcoming, ...queryParams } = params;

  for (let page = 1; page <= pagesNeeded; page++) {
    const url = new URL(`${KOBIS_API_BASE}/movie/searchMovieList.json`);
    url.searchParams.set("key", key);
    url.searchParams.set("itemPerPage", String(pageSize));
    url.searchParams.set("curPage", String(page));
    for (const [k, v] of Object.entries(queryParams)) {
      if (v) url.searchParams.set(k, v);
    }

    try {
      const res = await fetch(url, { next: { revalidate: 60 * 60 * 6 }, signal: AbortSignal.timeout(KOBIS_FETCH_TIMEOUT_MS) });
      if (!res.ok) {
        console.warn(`[kobis] searchMovieList 실패: HTTP ${res.status} (page ${page})`);
        break;
      }
      const data: { movieListResult?: { movieList?: RawMovieListItem[] } } = await res.json();
      const items = data.movieListResult?.movieList ?? [];
      if (items.length === 0) break;

      for (const item of items) {
        const summary = toMovieSummary(item);
        if (!summary || !summary.openDate) continue; // 개봉일 미확정작은 제외
        if (!includeUpcoming && summary.openDate.replace(/-/g, "") > todayStamp) continue; // 개봉 예정작 제외
        if (isAdultContent(summary)) continue; // 성인물 제외
        collected.push(summary);
      }
      if (items.length < pageSize) break;
    } catch (error) {
      console.warn(`[kobis] searchMovieList 요청 중 오류 (page ${page}):`, error);
      break;
    }
  }

  collected.sort((a, b) => (b.openDate ?? "").localeCompare(a.openDate ?? ""));

  // 같은 영화가 여러 페이지에 걸쳐 중복 등록돼 있을 수 있어 movieCd 기준으로 dedupe.
  const seen = new Set<string>();
  const deduped: KobisMovieSummary[] = [];
  for (const movie of collected) {
    if (seen.has(movie.movieCd)) continue;
    seen.add(movie.movieCd);
    deduped.push(movie);
    if (deduped.length >= maxResults) break;
  }
  return deduped;
}

type EarliestMatch = { movieCd: string; openDate: string | null; director: string | null };

function toEarliestMatch(item: RawMovieListItem): EarliestMatch | null {
  if (!item.movieCd) return null;
  return {
    movieCd: item.movieCd,
    openDate: toOpenDateIso(item.openDt),
    director: item.directors?.[0]?.peopleNm?.trim() || null,
  };
}

// 필모그래피 조회 시 이 함수가 수십 건 동시에 호출될 수 있어(배우 한 명당 출연작 개수만큼),
// 일시적인 요청 실패로 실제로는 있는 작품이 누락되지 않도록 한 번 재시도한다.
async function fetchTitleCandidates(query: string, key: string): Promise<RawMovieListItem[]> {
  const searchTerm = stripEdition(query);
  const url = new URL(`${KOBIS_API_BASE}/movie/searchMovieList.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("movieNm", searchTerm);
  url.searchParams.set("itemPerPage", "20");

  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 60 * 60 * 24 }, signal: AbortSignal.timeout(KOBIS_FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    try {
      res = await fetch(url, { next: { revalidate: 60 * 60 * 24 }, signal: AbortSignal.timeout(KOBIS_FETCH_TIMEOUT_MS) });
    } catch (error) {
      console.warn(`[kobis] "${query}" 검색 실패 (재시도 후에도 오류):`, error);
      return [];
    }
  }
  if (!res.ok) {
    console.warn(`[kobis] "${query}" 검색 실패: HTTP ${res.status}`);
    return [];
  }
  // KOBIS는 한도 초과·점검 때 200으로 HTML/오류 JSON을 돌려주기도 해서 파싱 실패도 빈 결과로 처리한다.
  const data = (await res.json().catch(() => null)) as { movieListResult?: { movieList?: RawMovieListItem[] } } | null;
  return data?.movieListResult?.movieList ?? [];
}

function exactTitleMatches(items: RawMovieListItem[], query: string): RawMovieListItem[] {
  const target = normalizeTitle(stripEdition(query));
  return items.filter((item) => item.movieNm && normalizeTitle(item.movieNm) === target);
}

async function findEarliestRegistration(query: string, key: string): Promise<EarliestMatch | null> {
  const items = await fetchTitleCandidates(query, key);
  if (items.length === 0) return null;

  const exactMatches = exactTitleMatches(items, query);
  if (exactMatches.length === 0) {
    return toEarliestMatch(items[0]);
  }

  // 같은 제목이 여러 번 등록돼 있으면(재개봉 등) 가장 먼저 개봉한 등록 = 원 개봉을 고른다.
  const withDate = exactMatches.filter((item) => item.openDt);
  const earliest =
    withDate.length > 0
      ? withDate.reduce((a, b) => (a.openDt! < b.openDt! ? a : b))
      : exactMatches[0];
  return toEarliestMatch(earliest);
}

// 제목으로 원 개봉(가장 이른 등록)의 개봉일을 찾는다 — 재개봉작의 "원래 개봉연도" 표시용.
export async function findOriginalReleaseByTitle(title: string): Promise<EarliestMatch | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    return await findEarliestRegistration(title, key);
  } catch (error) {
    console.warn(`[kobis] "${title}" 원 개봉일 조회 중 오류:`, error);
    return null;
  }
}

// 제목 + 출연진(감독/배우 이름)으로 KOBIS movieCd를 찾는다. 제목만으로 찾으면 같은 한글
// 제목을 쓰는 서로 다른 영화(동명이인 영화 — 예: "컨택트")를 헷갈릴 수 있어서, 후보가
// 여럿이면 실제 감독/출연진에 이 사람 이름이 있는 후보만 채택한다. 확인이 안 되면(후보가
// 여럿인데 아무도 일치하지 않으면) 엉뚱한 영화 정보를 보여주느니 그냥 포기한다.
//
// 제목이 유일하게 하나만 잡히면 KOBIS 출연진 대조 없이 그대로 채택한다 — 한때(안재홍
// 사례 대응) 여기서도 항상 KOBIS 캐스팅과 대조하도록 했었는데, KOBIS의 출연진 목록은
// getMovieDetailsByCd에서 상위 20명까지만 담기도 하고 애초에 KOBIS 쪽 등록 자체가
// 실제보다 부실한 경우가 있어서, 실제로 출연한 정상적인 작품(예: 박정민의 "얼굴")까지
// 함께 걸러지는 부작용이 실제로 확인됐다(71편 -> 29편, 검색 단계에서 확인된 42편보다도
// 적게 줄어듦). 동명이인 방지는 이제 상위 단계(searchKmdbFilmography의 personId 전용
// 매칭, PersonIdentityMapping)에서 이미 훨씬 정확하게 처리되고 있어서, 여기서까지 다시
// KOBIS로 재검증하면 "한쪽 소스에만 있는 정상 작품"을 잘못 쳐내는 비용이 더 크다.
//
// 다만 제목만 같고 아예 무관한 별개의 영화(예: 개봉 예정인 신작 "손 없는 날"과, 제목만
// 우연히 같은 훨씬 예전의 단편 "손 없는 날")까지 걸러내는 안전장치는 필요하다 — 이건
// KOBIS 출연진이 부실해서 생기는 문제가 아니라 제목 문자열 자체가 우연히 겹치는
// 별개의 두 영화라, 위에서 뺀 "캐스팅 재검증"과는 다른 문제다. yearHint(KMDb가 알려준
// 제작연도)가 있는데 유일한 후보의 개봉연도가 그와 1년 넘게 차이나면(미개봉작이라
// 후보의 openDt가 아예 없는 경우는 문제 없음) 그 후보는 채택하지 않는다.
// 한글 제목으로 못 찾으면(주로 KOBIS에 등록된 원어 표기가 다른 경우) 영문 제목으로 재시도한다.
export async function findMovieCdByTitleAndPerson(
  title: string,
  personName: string,
  englishTitle?: string | null,
  role?: "감독" | "배우" | null,
  yearHint?: string | null
): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;

  const checkDirector = role !== "배우";
  const checkCast = role !== "감독";

  async function resolve(query: string): Promise<string | null> {
    const items = await fetchTitleCandidates(query, key!);
    const exact = exactTitleMatches(items, query);
    if (exact.length === 0) return null;
    if (exact.length === 1) {
      const only = exact[0];
      if (yearHint && only.openDt) {
        const candidateYear = Number(only.openDt.slice(0, 4));
        const hintYear = Number(yearHint);
        if (!Number.isNaN(candidateYear) && !Number.isNaN(hintYear) && Math.abs(candidateYear - hintYear) > 1) {
          return null;
        }
      }
      return only.movieCd ?? null;
    }

    const normalizedPerson = normalizeTitle(personName);
    const details = await Promise.all(
      exact.map((item) => (item.movieCd ? getMovieDetailsByCd(item.movieCd) : null))
    );
    const matchByCast = details.find((d) => {
      if (!d) return false;
      const directorMatch = checkDirector && !!d.director && normalizeTitle(d.director.name) === normalizedPerson;
      const castMatch = checkCast && d.cast.some((c) => normalizeTitle(c.name) === normalizedPerson);
      return directorMatch || castMatch;
    });
    if (matchByCast) return matchByCast.movieCd;

    // 정확히 일치하는 이름이 없으면(부가 표기 등), 이름이 서로 포함 관계인 경우로 완화한다.
    // (역할 범위는 그대로 유지 — 감독으로 들어왔으면 출연진 이름과는 비교하지 않는다.)
    if (normalizedPerson.length < 2) return null;
    const matchByFuzzyCast = details.find((d) => {
      if (!d) return false;
      const nameMatches = (name: string) => {
        const n = normalizeTitle(name);
        return n.length >= 2 && (n.includes(normalizedPerson) || normalizedPerson.includes(n));
      };
      const directorMatch = checkDirector && !!d.director && nameMatches(d.director.name);
      const castMatch = checkCast && d.cast.some((c) => nameMatches(c.name));
      return directorMatch || castMatch;
    });
    return matchByFuzzyCast?.movieCd ?? null;
  }

  try {
    const byKorean = await resolve(title);
    if (byKorean) return byKorean;
    if (englishTitle) return await resolve(englishTitle);
    return null;
  } catch (error) {
    console.warn(`[kobis] "${title}" (${personName}) 검색 요청 중 오류:`, error);
    return null;
  }
}

// ── 영화 상세 (searchMovieInfo) ─────────────────────────────────────────────

export type KobisPersonRef = { name: string };
export type KobisCastMember = KobisPersonRef & { role: string };

export type KobisMovieDetails = {
  movieCd: string;
  title: string;
  titleEn: string | null;
  overview: string | null; // KOBIS엔 시놉시스가 없어 항상 null (인터페이스 호환용으로 유지)
  posterUrl: string | null; // KOBIS엔 이미지가 없어 항상 null (인터페이스 호환용으로 유지)
  openDate: string | null;
  runtimeMinutes: number | null;
  watchGrade: string | null;
  director: KobisPersonRef | null;
  cast: KobisCastMember[];
  genreAlt: string | null;
  nationAlt: string | null;
};

type RawMovieInfo = {
  movieCd?: string;
  movieNm?: string;
  movieNmEn?: string;
  showTm?: string;
  openDt?: string;
  genres?: { genreNm?: string }[];
  nations?: { nationNm?: string }[];
  directors?: { peopleNm?: string }[];
  actors?: { peopleNm?: string; cast?: string }[];
  audits?: { watchGradeNm?: string }[];
};

// 필모그래피 조회 시(동명이인 구분을 위해 제목이 겹치는 후보끼리 대조할 때) 이
// 함수가 연달아 여러 번 호출될 수 있어서, fetchTitleCandidates와 같은 이유로 한
// 번 재시도한다 — 재시도 없이는 일시적인 요청 실패로 실제로는 있는 작품이 없는
// 것처럼 취급돼, 같은 인물을 다시 조회할 때마다 결과 편수가 들쭉날쭉해지는
// 원인이 된다(실제로 관측됨: 같은 필모그래피가 조회할 때마다 29편/33편으로 다르게 나옴).
export async function getMovieDetailsByCd(movieCd: string): Promise<KobisMovieDetails | null> {
  const key = apiKey();
  if (!key) return null;

  const url = new URL(`${KOBIS_API_BASE}/movie/searchMovieInfo.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("movieCd", movieCd);

  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 60 * 60 * 24 }, signal: AbortSignal.timeout(KOBIS_FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    try {
      res = await fetch(url, { next: { revalidate: 60 * 60 * 24 }, signal: AbortSignal.timeout(KOBIS_FETCH_TIMEOUT_MS) });
    } catch (error) {
      console.warn(`[kobis] searchMovieInfo(${movieCd}) 실패 (재시도 후에도 오류):`, error);
      return null;
    }
  }

  try {
    if (!res.ok) {
      console.warn(`[kobis] searchMovieInfo(${movieCd}) 실패: HTTP ${res.status}`);
      return null;
    }
    const data: { movieInfoResult?: { movieInfo?: RawMovieInfo } } = await res.json();
    const info = data.movieInfoResult?.movieInfo;
    if (!info || !info.movieCd || !info.movieNm) return null;

    return {
      movieCd: info.movieCd,
      title: info.movieNm,
      titleEn: info.movieNmEn?.trim() || null,
      overview: null,
      posterUrl: null,
      openDate: toOpenDateIso(info.openDt),
      runtimeMinutes: info.showTm ? Number(info.showTm) : null,
      watchGrade: info.audits?.[0]?.watchGradeNm?.trim() || null,
      director: info.directors?.[0]?.peopleNm ? { name: info.directors[0].peopleNm.trim() } : null,
      // 상위 6명만 담으면 주연이 아닌 배우는 출연진 매칭(동명이인 구분, 포스터 검색 등)에서
      // 놓칠 수 있어 넉넉히 20명까지 담는다. 화면에 다 보여줄 필요는 없어 표시는 UI에서 잘라낸다.
      cast: (info.actors ?? [])
        .filter((a) => a.peopleNm)
        .slice(0, 20)
        .map((a) => ({ name: a.peopleNm!.trim(), role: a.cast?.trim() ?? "" })),
      genreAlt: info.genres?.map((g) => g.genreNm).filter(Boolean).join(", ") || null,
      nationAlt: info.nations?.map((n) => n.nationNm).filter(Boolean).join(", ") || null,
    };
  } catch (error) {
    console.warn(`[kobis] searchMovieInfo(${movieCd}) 요청 중 오류:`, error);
    return null;
  }
}

// 검색창용 — 1960년 이후 개봉작만 남긴다.
export type KobisSearchHit = {
  movieCd: string;
  title: string;
  releaseDate: string | null;
  genre: string | null;
};

export async function searchMoviesSince1960(query: string): Promise<KobisSearchHit[]> {
  const results = await searchMovieCatalog({ movieNm: query }, 10);
  return results
    .filter((m) => m.openDate && Number(m.openDate.slice(0, 4)) >= 1960)
    .map((m) => ({ movieCd: m.movieCd, title: m.title, releaseDate: m.openDate, genre: m.genreAlt }));
}

// ── 영화인(인물) 목록 ────────────────────────────────────────────────────────
// KMDb와는 완전히 별개인 KOFIC 자체 인물 코드(peopleCd) 체계 — KMDb의 kmdbId와
// 서로 매핑되는 값이 아니다(두 기관이 각자 독립적으로 부여한 코드). 그래서 이걸로
// "이 kmdbId에 대응하는 peopleCd"를 직접 찾을 수는 없고, 어디까지나 이름으로
// 다시 검색해서 얻는 별도의 참고 정보(대표작 등)로만 쓴다.
//
// 응답 필드(peopleCd/peopleNm/repRoleNm/filmoNames)는 KOFIC 공식 서비스 페이지와
// 실제 사용 사례로 확인됐지만, filmoNames가 정확히 어떤 구분자로 이어진 문자열인지는
// 검증 못 했다 — 우선 쉼표 기준으로 나누고, 실제 응답을 보고 필요하면 조정한다.
type RawPeopleListItem = {
  peopleCd?: string;
  peopleNm?: string;
  repRoleNm?: string;
  filmoNames?: string;
};

export type KoficPeopleHit = {
  peopleCd: string;
  name: string;
  repRoleNm: string | null;
  filmoNames: string[];
};

export async function searchKoficPeopleList(peopleNm: string): Promise<KoficPeopleHit[]> {
  const key = apiKey();
  if (!key) return [];

  const url = new URL(`${KOBIS_API_BASE}/people/searchPeopleList.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("peopleNm", peopleNm);
  url.searchParams.set("itemPerPage", "10");

  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 }, signal: AbortSignal.timeout(KOBIS_FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      console.warn(`[kobis] searchPeopleList("${peopleNm}") 실패: HTTP ${res.status}`);
      return [];
    }
    const data: { peopleListResult?: { peopleList?: RawPeopleListItem[] } } = await res.json();
    const list = data.peopleListResult?.peopleList ?? [];
    return list
      .filter((p): p is RawPeopleListItem & { peopleCd: string; peopleNm: string } => !!p.peopleCd && !!p.peopleNm)
      .map((p) => ({
        peopleCd: p.peopleCd,
        name: p.peopleNm,
        repRoleNm: p.repRoleNm?.trim() || null,
        filmoNames: (p.filmoNames ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }));
  } catch (error) {
    console.warn(`[kobis] searchPeopleList("${peopleNm}") 요청 중 오류:`, error);
    return [];
  }
}

// ── 재개봉작 ────────────────────────────────────────────────────────────────

export type RereleaseCheck = {
  isRerelease: boolean;
  originalReleaseDate: string | null;
};

// 재개봉 여부는 제작연도-개봉연도 격차나 제목의 수식어만으로는 신뢰할 수 없다 — 독립·예술
// 영화는 제작 후 수년 뒤에야 국내에서 "처음" 개봉하는 일이 흔하고, "극장판" 같은 표현은
// 재개봉이 아닌 신작 애니메이션 제목에도 흔히 쓰인다("이누야샤 극장판" 등). 그래서 "같은
// 제목으로 KOBIS에 더 이른 별도 등록이 있는가"를 기본 근거로 삼되, 제목만 같고 실제로는
// 전혀 다른 영화인 동명이인 케이스("딥 워터"처럼 서로 다른 두 영화가 같은 제목을 쓰는 경우)를
// 걸러내기 위해 두 등록의 감독명이 둘 다 확인되는데 서로 다르면 재개봉으로 보지 않는다.
export async function resolveRerelease(
  movie: Pick<KobisMovieSummary, "movieCd" | "title" | "openDate"> & { director?: string | null }
): Promise<RereleaseCheck> {
  const original = await findOriginalReleaseByTitle(movie.title);
  const hasEarlierRegistration =
    !!original &&
    original.movieCd !== movie.movieCd &&
    !!original.openDate &&
    !!movie.openDate &&
    original.openDate < movie.openDate;
  if (!hasEarlierRegistration) {
    return { isRerelease: false, originalReleaseDate: null };
  }

  const currentDirector = movie.director ? normalizeTitle(movie.director) : null;
  const originalDirector = original!.director ? normalizeTitle(original!.director) : null;
  if (currentDirector && originalDirector && currentDirector !== originalDirector) {
    return { isRerelease: false, originalReleaseDate: null }; // 제목만 같은 다른 영화
  }

  return { isRerelease: true, originalReleaseDate: original!.openDate };
}

// ── 박스오피스 (일별/주간) ───────────────────────────────────────────────────

type DailyBoxOfficeItem = {
  rank?: string; // "1" ~ "10"
  movieCd?: string;
  movieNm?: string;
  openDt?: string; // "YYYY-MM-DD" (KOBIS 박스오피스 응답은 이미 하이픈 포함 형식으로 준다)
  audiAcc?: string;
  salesAcc?: string;
};

export type KoficBoxOffice = {
  audiAcc: number; // 누적 관객수
  salesAcc: number; // 누적 매출액 (원)
  rank: number | null; // 일별 박스오피스 순위 (상세 페이지 "박스오피스 N위" 배지)
};

// KOBIS는 키 오류·하루 호출 한도 초과 같은 실패도 HTTP 200 + {"faultInfo": {...}} 본문으로 돌려준다.
function kobisFault(data: unknown): string | null {
  const fault = (data as { faultInfo?: { errorCode?: string; message?: string } } | null)?.faultInfo;
  return fault ? `${fault.errorCode ?? ""} ${fault.message ?? ""}`.trim() || "faultInfo" : null;
}

class EmptyBoxOfficeError extends Error {}

type BoxOfficeKind = "daily" | "weekly";

// 박스오피스(일별·주간) 응답은 성공한 것만 6시간 캐시한다. 예전엔 fetch 캐시(next.revalidate)를 썼는데,
// 그건 HTTP 200이면 faultInfo 오류 본문까지 그대로 6시간 저장해서 KOBIS가 잠깐만 실패해도
// "현재 상영중인 영화"·"이번주 박스오피스"가 반나절 동안 통째로 비었다. 실패는 throw해서 캐시에 남기지 않는다.
async function fetchBoxOfficeList(kind: BoxOfficeKind, targetDt: string): Promise<DailyBoxOfficeItem[]> {
  const key = apiKey();
  if (!key) return [];
  const endpoint = kind === "daily" ? "searchDailyBoxOfficeList" : "searchWeeklyBoxOfficeList";
  const url = new URL(`${KOBIS_API_BASE}/boxoffice/${endpoint}.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("targetDt", targetDt);
  if (kind === "weekly") url.searchParams.set("weekGb", "0"); // 0: 주간(월~일)

  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(KOBIS_FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json().catch(() => null)) as {
    boxOfficeResult?: { dailyBoxOfficeList?: DailyBoxOfficeItem[]; weeklyBoxOfficeList?: DailyBoxOfficeItem[] };
  } | null;
  const fault = kobisFault(data);
  if (fault) throw new Error(fault);
  const list = kind === "daily" ? data?.boxOfficeResult?.dailyBoxOfficeList : data?.boxOfficeResult?.weeklyBoxOfficeList;
  // 아직 집계 전인 날·주(이번 주 등)는 빈 목록이 온다 — 오류는 아니지만 캐시하지 않는다.
  if (!Array.isArray(list) || list.length === 0) throw new EmptyBoxOfficeError("빈 목록");
  return list;
}

const cachedBoxOfficeList = unstable_cache(fetchBoxOfficeList, ["kobis-box-office-v1"], { revalidate: 60 * 60 * 6 });

// 실패 직후 잠깐은 KOBIS를 다시 부르지 않는다 — 상세 페이지마다 10초 타임아웃을 기다리거나, 한도 초과 상태에서
// 호출을 더 쌓지 않게(서버 인스턴스 단위).
const BOX_OFFICE_FAIL_COOLDOWN_MS = 5 * 60 * 1000;
let boxOfficeFailedAt = 0;

async function getBoxOfficeItems(kind: BoxOfficeKind, targetDt: string): Promise<DailyBoxOfficeItem[]> {
  if (!apiKey()) return [];
  if (Date.now() - boxOfficeFailedAt < BOX_OFFICE_FAIL_COOLDOWN_MS) return [];
  try {
    // Next 서버 밖(scripts/를 tsx로 실행)에는 캐시 저장소가 없어 바로 부른다.
    return process.env.NEXT_RUNTIME
      ? await cachedBoxOfficeList(kind, targetDt)
      : await fetchBoxOfficeList(kind, targetDt);
  } catch (error) {
    if (error instanceof EmptyBoxOfficeError) return [];
    boxOfficeFailedAt = Date.now();
    console.warn(
      `[kobis] ${kind === "daily" ? "일별" : "주간"} 박스오피스(${targetDt}) 조회 실패:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

export type KoficWeeklyEntry = {
  rank: number;
  movieCd: string | null;
  movieNm: string;
  openYear: string | null; // KMDb 검색에 힌트로 쓸 개봉연도 (형식이 endpoint마다 달라 연도만 뽑아둔다)
  openDate: string | null; // ISO — 재개봉 판정 배치가 KMDb 개봉일과 대조할 때 쓴다
  audiAcc: number;
  salesAcc: number;
};

function extractYear(openDt: string | undefined): string | null {
  const match = openDt?.match(/^\d{4}/);
  return match ? match[0] : null;
}

// 오늘 기준 지난 주(데이터가 확정된) 월요일 — "이번 주"는 아직 집계 중일 수 있어 기본값으로 쓴다.
function getLastConfirmedMonday(): Date {
  const now = new Date();
  const diffToMonday = (now.getDay() + 6) % 7; // 오늘이 월요일이면 0
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - diffToMonday - 7);
  return lastMonday;
}

// 어떤 달의 1일부터 오늘(또는 그 달 말일, 이미 지난 달이면)까지 걸치는 모든 월요일 목록.
// "이 달의 Best"를 누적 관객수 기준으로 매기려고 그 달의 매주 박스오피스를 다 훑을 때 쓴다.
export function getMondaysInMonth(year: number, monthIndex0: number): Date[] {
  const monthStart = new Date(year, monthIndex0, 1);
  const monthEnd = new Date(year, monthIndex0 + 1, 0);
  const today = new Date();
  const rangeEnd = monthEnd < today ? monthEnd : today;

  const mondays: Date[] = [];
  const cursor = new Date(monthStart);
  cursor.setDate(cursor.getDate() + ((8 - cursor.getDay()) % 7)); // 그 달의 첫 월요일로 이동
  while (cursor <= rangeEnd) {
    mondays.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return mondays;
}

// 특정 주(월요일 날짜 기준) 박스오피스 TOP N. targetMonday를 생략하면 데이터가 확정된 지난 주.
export async function getWeeklyBoxOffice(
  limit = 10,
  targetMonday?: Date
): Promise<KoficWeeklyEntry[]> {
  const monday = targetMonday ?? getLastConfirmedMonday();
  const list = await getBoxOfficeItems("weekly", toDateStamp(monday));
  return list.slice(0, limit).map((item, index) => ({
    rank: index + 1,
    movieCd: item.movieCd ?? null,
    movieNm: item.movieNm ?? "제목 없음",
    openYear: extractYear(item.openDt),
    openDate: item.openDt ?? null,
    audiAcc: Number(item.audiAcc ?? 0),
    salesAcc: Number(item.salesAcc ?? 0),
  }));
}

// 특정 날(오늘로부터 daysAgo일 전) 일별 박스오피스 목록 — 현재 상영중인 영화 파악에 사용.
export async function getDailyBoxOfficeList(daysAgo: number): Promise<KoficWeeklyEntry[]> {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  try {
    const items = await getBoxOfficeItems("daily", toDateStamp(date));
    return items
      .filter((item): item is DailyBoxOfficeItem & { movieCd: string; movieNm: string } =>
        Boolean(item.movieCd && item.movieNm)
      )
      .map((item, idx) => ({
        rank: idx + 1,
        movieCd: item.movieCd,
        movieNm: item.movieNm,
        openYear: extractYear(item.openDt),
        openDate: item.openDt ?? null,
        audiAcc: Number(item.audiAcc ?? 0),
        salesAcc: Number(item.salesAcc ?? 0),
      }));
  } catch {
    return [];
  }
}

// 최근 며칠간의 일별 박스오피스에서 제목이 일치하는 영화를 찾는다.
export async function getKoficBoxOfficeByTitle(title: string): Promise<KoficBoxOffice | null> {
  const key = apiKey();
  if (!key) return null;

  const target = normalizeTitle(title);

  try {
    // 당일 데이터가 아직 집계 전일 수 있어 어제부터 최대 3일 전까지 훑는다.
    for (let daysAgo = 1; daysAgo <= 3; daysAgo++) {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      const targetDt = toDateStamp(date);

      const list = await getBoxOfficeItems("daily", targetDt);
      const match = list.find((item) => item.movieNm && normalizeTitle(item.movieNm) === target);
      if (match) {
        return {
          audiAcc: Number(match.audiAcc ?? 0),
          salesAcc: Number(match.salesAcc ?? 0),
          rank: Number.isFinite(Number(match.rank)) && Number(match.rank) > 0 ? Number(match.rank) : null,
        };
      }
    }
    return null;
  } catch (error) {
    console.warn(`[kobis] "${title}" 박스오피스 조회 중 오류:`, error);
    return null;
  }
}
