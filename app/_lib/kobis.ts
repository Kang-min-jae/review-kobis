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
  return title.replace(/\s+/g, "").toLowerCase();
}

// ── 카탈로그 검색 (searchMovieList) ─────────────────────────────────────────

type RawMovieListItem = {
  movieCd?: string;
  movieNm?: string;
  movieNmEn?: string;
  openDt?: string; // "YYYYMMDD" 또는 미개봉 시 빈 문자열
  prdtYear?: string;
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
  openStartDt?: string; // "YYYYMMDD"
  openEndDt?: string; // "YYYYMMDD"
  repNationCd?: "K" | "F";
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

  for (let page = 1; page <= pagesNeeded; page++) {
    const url = new URL(`${KOBIS_API_BASE}/movie/searchMovieList.json`);
    url.searchParams.set("key", key);
    url.searchParams.set("itemPerPage", String(pageSize));
    url.searchParams.set("curPage", String(page));
    for (const [k, v] of Object.entries(params)) {
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
        if (!summary || !summary.openDate) continue; // 아직 개봉 안 한 영화는 제외
        if (summary.openDate.replace(/-/g, "") > todayStamp) continue; // 개봉 예정작 제외
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

async function searchMovieCdOnce(query: string, key: string): Promise<string | null> {
  const url = new URL(`${KOBIS_API_BASE}/movie/searchMovieList.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("movieNm", query);
  url.searchParams.set("itemPerPage", "20");

  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
  if (!res.ok) {
    console.warn(`[kobis] "${query}" 검색 실패: HTTP ${res.status}`);
    return null;
  }
  const data: { movieListResult?: { movieList?: RawMovieListItem[] } } = await res.json();
  const items = data.movieListResult?.movieList ?? [];
  if (items.length === 0) return null;

  const target = normalizeTitle(query);
  const exact = items.find((item) => item.movieNm && normalizeTitle(item.movieNm) === target);
  return (exact ?? items[0]).movieCd ?? null;
}

// 제목으로 가장 가까운 한 편을 찾는다. 정확히 일치하는 제목을 우선하고, 없으면 첫 결과를 쓴다.
// 한글 제목으로 못 찾으면(주로 KOBIS에 등록된 원어 표기가 다른 경우) 영문 제목으로 재시도한다.
export async function findMovieCdByTitle(
  title: string,
  englishTitle?: string
): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;

  try {
    const byKorean = await searchMovieCdOnce(title, key);
    if (byKorean) return byKorean;
    if (englishTitle) return await searchMovieCdOnce(englishTitle, key);
    return null;
  } catch (error) {
    console.warn(`[kobis] "${title}" 검색 요청 중 오류:`, error);
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
      cast: (info.actors ?? [])
        .filter((a) => a.peopleNm)
        .slice(0, 6)
        .map((a) => ({ name: a.peopleNm!.trim(), role: a.cast?.trim() ?? "" })),
      genreAlt: info.genres?.map((g) => g.genreNm).filter(Boolean).join(", ") || null,
      nationAlt: info.nations?.map((n) => n.nationNm).filter(Boolean).join(", ") || null,
    };
  } catch (error) {
    console.warn(`[kobis] searchMovieInfo(${movieCd}) 요청 중 오류:`, error);
    return null;
  }
}

// 로컬 큐레이션 영화(제목만 앎)의 KOBIS 상세정보를 찾는다 — 제목 검색 → 상세 조회.
export async function getMovieInfoByTitle(
  title: string,
  englishTitle?: string
): Promise<KobisMovieDetails | null> {
  const movieCd = await findMovieCdByTitle(title, englishTitle);
  if (!movieCd) return null;
  return getMovieDetailsByCd(movieCd);
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

// ── 박스오피스 (일별/주간) ───────────────────────────────────────────────────

type DailyBoxOfficeItem = {
  movieCd?: string;
  movieNm?: string;
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
  audiAcc: number;
  salesAcc: number;
};

// 이번 주 박스오피스 TOP N. "월~일" 한 주를 그 주의 월요일 날짜로 조회한다. 이번 주는
// 아직 집계 중일 수 있어, 데이터가 확정된 지난 주 기준으로 가져온다.
export async function getWeeklyBoxOffice(limit = 10): Promise<KoficWeeklyEntry[]> {
  const key = apiKey();
  if (!key) return [];

  const now = new Date();
  const diffToMonday = (now.getDay() + 6) % 7; // 오늘이 월요일이면 0
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - diffToMonday - 7);

  const url = new URL(`${KOBIS_API_BASE}/boxoffice/searchWeeklyBoxOfficeList.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("targetDt", toDateStamp(lastMonday));
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
