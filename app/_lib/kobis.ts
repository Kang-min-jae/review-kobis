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

const KOBIS_API_BASE = "https://kobis.or.kr/kobisopenapi/webservice/rest";

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

// genreAlt만으로는 저예산 성인물이 "성인"/"에로" 장르 태그 없이 등록된 경우를 못 거른다 —
// 제목에 흔히 쓰이는 노골적인 표현도 같이 확인한다. "하룻밤"처럼 일반 영화 제목에도
// 흔히 쓰이는 단어는 오탐이 많아 넣지 않는다.
const ADULT_CONTENT_TITLE_PATTERN =
  /(거근|정사|불륜|스와핑|색정|음란|관음증?|애액|자위|후배위|몸종|씨받이|폭유|치정|섹스|19금|성인용|유부녀|신음|속궁합|육체를?\s*탐하|탐하는\s*(육체|몸)|구멍|다리\s*사이|가랑이|올라타[다는]?|올라탄|올라탔|욕정|발정|정욕|나체|알몸|은밀한\s*밤|불타는\s*밤)/;

function isAdultContent(movie: { title: string; genreAlt: string | null }): boolean {
  if (movie.genreAlt && /성인|에로/.test(movie.genreAlt)) return true;
  return ADULT_CONTENT_TITLE_PATTERN.test(movie.title);
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
      const res = await fetch(url, { next: { revalidate: 60 * 60 * 6 } });
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
    res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    try {
      res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
    } catch (error) {
      console.warn(`[kobis] "${query}" 검색 실패 (재시도 후에도 오류):`, error);
      return [];
    }
  }
  if (!res.ok) {
    console.warn(`[kobis] "${query}" 검색 실패: HTTP ${res.status}`);
    return [];
  }
  const data: { movieListResult?: { movieList?: RawMovieListItem[] } } = await res.json();
  return data.movieListResult?.movieList ?? [];
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
// 한글 제목으로 못 찾으면(주로 KOBIS에 등록된 원어 표기가 다른 경우) 영문 제목으로 재시도한다.
export async function findMovieCdByTitleAndPerson(
  title: string,
  personName: string,
  englishTitle?: string | null,
  role?: "감독" | "배우" | null
): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;

  const checkDirector = role !== "배우";
  const checkCast = role !== "감독";

  async function resolve(query: string): Promise<string | null> {
    const items = await fetchTitleCandidates(query, key!);
    const exact = exactTitleMatches(items, query);
    if (exact.length === 0) return null;
    if (exact.length === 1) return exact[0].movieCd ?? null;

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
  showTm?: string;
  openDt?: string;
  genres?: { genreNm?: string }[];
  nations?: { nationNm?: string }[];
  directors?: { peopleNm?: string }[];
  actors?: { peopleNm?: string; cast?: string }[];
  audits?: { watchGradeNm?: string }[];
};

export async function getMovieDetailsByCd(movieCd: string): Promise<KobisMovieDetails | null> {
  const key = apiKey();
  if (!key) return null;

  const url = new URL(`${KOBIS_API_BASE}/movie/searchMovieInfo.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("movieCd", movieCd);

  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
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
};

export async function searchMoviesSince1960(query: string): Promise<KobisSearchHit[]> {
  const results = await searchMovieCatalog({ movieNm: query }, 10);
  return results
    .filter((m) => m.openDate && Number(m.openDate.slice(0, 4)) >= 1960)
    .map((m) => ({ movieCd: m.movieCd, title: m.title, releaseDate: m.openDate }));
}

// ── 재개봉작 ────────────────────────────────────────────────────────────────

export type KobisRerelease = {
  movieCd: string;
  title: string;
  titleEn: string | null;
  director: string | null;
  rereleaseDate: string; // 이번 재개봉일 (ISO)
  originalReleaseDate: string | null; // 원 개봉일 (ISO, 못 찾으면 null)
};

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

// 지정한 개봉일 범위(gte~lte, ISO) 안의 영화 중, 실제로 더 이른 개봉 이력이 확인되는
// 영화만 재개봉작으로 분류한다.
export async function searchRereleasesInRange(
  gte: string,
  lte: string,
  limit: number
): Promise<KobisRerelease[]> {
  const pool = await searchMovieCatalog(
    { openStartDt: gte.slice(0, 4), openEndDt: lte.slice(0, 4), includeUpcoming: true },
    500
  );
  const candidates = pool.filter((m) => m.openDate && m.openDate >= gte && m.openDate <= lte);
  const checks = await Promise.all(candidates.map((m) => resolveRerelease(m)));

  const rereleases: KobisRerelease[] = [];
  candidates.forEach((m, i) => {
    if (!checks[i].isRerelease) return;
    rereleases.push({
      movieCd: m.movieCd,
      title: m.title,
      titleEn: m.titleEn,
      director: m.director,
      rereleaseDate: m.openDate!,
      originalReleaseDate: checks[i].originalReleaseDate,
    });
  });
  return rereleases.slice(0, limit);
}

// ── 박스오피스 (일별/주간) ───────────────────────────────────────────────────

type DailyBoxOfficeItem = {
  movieCd?: string;
  movieNm?: string;
  openDt?: string; // "YYYY-MM-DD" (KOBIS 박스오피스 응답은 이미 하이픈 포함 형식으로 준다)
  audiAcc?: string;
  salesAcc?: string;
};

export type KoficBoxOffice = {
  audiAcc: number; // 누적 관객수
  salesAcc: number; // 누적 매출액 (원)
};

async function fetchDailyBoxOffice(targetDt: string, key: string): Promise<DailyBoxOfficeItem[]> {
  const url = new URL(`${KOBIS_API_BASE}/boxoffice/searchDailyBoxOfficeList.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("targetDt", targetDt);

  const res = await fetch(url, { next: { revalidate: 60 * 60 * 6 } });
  if (!res.ok) {
    console.warn(`[kobis] 일별 박스오피스(${targetDt}) 조회 실패: HTTP ${res.status}`);
    return [];
  }

  const data: { boxOfficeResult?: { dailyBoxOfficeList?: DailyBoxOfficeItem[] } } = await res.json();
  return data.boxOfficeResult?.dailyBoxOfficeList ?? [];
}

export type KoficWeeklyEntry = {
  rank: number;
  movieCd: string | null;
  movieNm: string;
  openYear: string | null; // KMDb 검색에 힌트로 쓸 개봉연도 (형식이 endpoint마다 달라 연도만 뽑아둔다)
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
  const key = apiKey();
  if (!key) return [];

  const monday = targetMonday ?? getLastConfirmedMonday();

  const url = new URL(`${KOBIS_API_BASE}/boxoffice/searchWeeklyBoxOfficeList.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("targetDt", toDateStamp(monday));
  url.searchParams.set("weekGb", "0"); // 0: 주간(월~일)

  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 6 } });
    if (!res.ok) {
      console.warn(`[kobis] 주간 박스오피스 조회 실패: HTTP ${res.status}`);
      return [];
    }
    const data: { boxOfficeResult?: { weeklyBoxOfficeList?: DailyBoxOfficeItem[] } } =
      await res.json();
    const list = data.boxOfficeResult?.weeklyBoxOfficeList ?? [];
    return list.slice(0, limit).map((item, index) => ({
      rank: index + 1,
      movieCd: item.movieCd ?? null,
      movieNm: item.movieNm ?? "제목 없음",
      openYear: extractYear(item.openDt),
      audiAcc: Number(item.audiAcc ?? 0),
      salesAcc: Number(item.salesAcc ?? 0),
    }));
  } catch (error) {
    console.warn(`[kobis] 주간 박스오피스 요청 중 오류:`, error);
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

      const list = await fetchDailyBoxOffice(targetDt, key);
      const match = list.find((item) => item.movieNm && normalizeTitle(item.movieNm) === target);
      if (match) {
        return {
          audiAcc: Number(match.audiAcc ?? 0),
          salesAcc: Number(match.salesAcc ?? 0),
        };
      }
    }
    return null;
  } catch (error) {
    console.warn(`[kobis] "${title}" 박스오피스 조회 중 오류:`, error);
    return null;
  }
}
