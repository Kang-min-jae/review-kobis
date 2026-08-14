import { allMovies, type Movie } from "./mock-movies";
import {
  searchMovieCatalog,
  findMovieCdByTitle,
  getMovieDetailsByCd,
  getWeeklyBoxOffice,
  type KobisMovieSummary,
  type CatalogSearchParams,
} from "./kobis";

export type RowMovie = {
  id: string;
  title: string;
  posterUrl: string | null;
  gradient: string;
  isNowShowing: boolean;
  badge?: string;
};

// KOBIS 카탈로그에서 온 영화는 로컬 그라디언트가 없고, KOBIS엔 포스터 이미지 자체가
// 없어서 posterUrl은 항상 null이다 — 카드에는 통일된 폴백 그라디언트가 항상 뜬다.
const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// KOBIS 개봉일 검색(openStartDt/openEndDt)은 연 단위(YYYY)까지만 지원한다. 정확한
// 날짜 범위(월/일 단위)가 필요하면 연 단위로 넉넉히 가져온 뒤 openDate(일 단위 ISO
// 문자열)로 다시 걸러낸다. KOBIS 응답 순서가 날짜순이라는 보장이 없어서, 정확한
// 최신순을 얻으려면 해당 연도 범위의 후보를 충분히 가져와야 한다.
async function fetchOpenedBetween(
  gte: string, // ISO yyyy-mm-dd, inclusive
  lte: string, // ISO yyyy-mm-dd, inclusive
  limit: number,
  extraParams: CatalogSearchParams = {}
): Promise<KobisMovieSummary[]> {
  const pool = await searchMovieCatalog(
    { ...extraParams, openStartDt: gte.slice(0, 4), openEndDt: lte.slice(0, 4) },
    Math.max(limit * 5, 300)
  );
  return pool.filter((m) => m.openDate && m.openDate >= gte && m.openDate <= lte).slice(0, limit);
}

export function toRowMovie(summary: KobisMovieSummary): RowMovie {
  return {
    id: `kobis-${summary.movieCd}`,
    title: summary.title,
    posterUrl: null,
    gradient: FALLBACK_GRADIENT,
    // KOBIS 카탈로그 전체에 대한 실제 상영 시간표가 없어서 기본은 예매 버튼을 숨긴다.
    // 로컬 큐레이션 상영작과 같은 영화로 확인되면 applyNowShowingOverrides가 true로 바꿔준다.
    isNowShowing: false,
  };
}

export function getNowShowing(): Movie[] {
  return allMovies.filter((m) => m.isNowShowing);
}

export function getRereleases(): Movie[] {
  return allMovies.filter((m) => m.isRerelease);
}

async function resolveLocalMovies(
  movies: Movie[]
): Promise<{ row: RowMovie; movieCd: string | null }[]> {
  const movieCds = await Promise.all(
    movies.map((m) => findMovieCdByTitle(m.title, m.englishTitle))
  );
  return movies.map((movie, i) => ({
    row: {
      id: movie.id,
      title: movie.title,
      // KOBIS엔 포스터가 없어 로컬 큐레이션 그라디언트를 그대로 쓴다.
      posterUrl: null,
      gradient: movie.gradient,
      isNowShowing: movie.isNowShowing,
    },
    movieCd: movieCds[i],
  }));
}

// 로컬 큐레이션 영화를 화면에 낼 때 쓰는 카드 목록 (포스터가 없어 그라디언트만 사용).
export async function resolveLocalMovieCards(movies: Movie[]): Promise<RowMovie[]> {
  const resolved = await resolveLocalMovies(movies);
  return resolved.map((r) => r.row);
}

// 현재 상영중인 로컬 영화의 KOBIS movieCd → 로컬 카드 매핑. KOBIS 카탈로그 행(최근/이달/올해/…)에
// 같은 영화가 섞여 나올 때, kobis-<movieCd> 카드 대신 예매 버튼이 붙은 로컬 카드로 바꿔치기하는 데 쓴다.
export async function getLocalNowShowingByMovieCd(): Promise<Map<string, RowMovie>> {
  const resolved = await resolveLocalMovies(getNowShowing());
  const map = new Map<string, RowMovie>();
  for (const { row, movieCd } of resolved) {
    if (movieCd) map.set(movieCd, row);
  }
  return map;
}

// kobis-<movieCd> 카드 중 실제로 우리 상영작 목록에 있는 영화는 로컬 카드(예매 버튼 포함)로 교체한다.
// 원래 카드에 badge(순위 등)가 있었다면 교체된 카드에도 이어서 보여준다.
export function applyNowShowingOverrides(
  movies: RowMovie[],
  nowShowingMap: Map<string, RowMovie>
): RowMovie[] {
  if (nowShowingMap.size === 0) return movies;
  return movies.map((movie) => {
    if (!movie.id.startsWith("kobis-")) return movie;
    const movieCd = movie.id.slice("kobis-".length);
    const localMatch = nowShowingMap.get(movieCd);
    if (!localMatch) return movie;
    return { ...localMatch, badge: movie.badge ?? localMatch.badge };
  });
}

// 이번 주 박스오피스 TOP N (실제 국내 관객수 기준, KOFIC 주간 박스오피스).
// 박스오피스 항목엔 movieCd가 그대로 들어있어 별도 검색 없이 바로 카드로 연결한다.
export async function getWeeklyBoxOfficeRow(): Promise<RowMovie[]> {
  const entries = await getWeeklyBoxOffice(10);
  const rows: RowMovie[] = [];
  for (const entry of entries) {
    if (!entry.movieCd) continue; // movieCd가 없으면(드묾) 평점 페이지로 연결할 방법이 없어 건너뛴다.
    rows.push({
      id: `kobis-${entry.movieCd}`,
      title: entry.movieNm,
      posterUrl: null,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: false,
      badge: `${entry.rank}위 · 누적 ${entry.audiAcc.toLocaleString("ko-KR")}명`,
    });
  }
  return rows;
}

// "사용자 추천 영화" — KOBIS엔 추천 API가 없어서, 내가 높게 평가한 영화들의 장르를 모아
// 같은 장르를 가진 최근 개봉작을 추천으로 보여준다 (평가한 영화 자체는 제외).
// 평가한 영화가 아직 없으면 최근 두 달 개봉작으로 대체.
export async function getRecommendedForRatedRow(seedMovieCds: string[]): Promise<RowMovie[]> {
  const today = isoDate(new Date());

  if (seedMovieCds.length === 0) {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
    const recent = await fetchOpenedBetween(isoDate(twoMonthsAgo), today, 8);
    return recent.map(toRowMovie);
  }

  const seedDetails = await Promise.all(seedMovieCds.map((cd) => getMovieDetailsByCd(cd)));
  const seedGenres = new Set<string>();
  for (const detail of seedDetails) {
    for (const g of detail?.genreAlt?.split(",") ?? []) {
      const trimmed = g.trim();
      if (trimmed) seedGenres.add(trimmed);
    }
  }
  if (seedGenres.size === 0) return [];

  const seedSet = new Set(seedMovieCds);
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const candidates = await fetchOpenedBetween(isoDate(twoYearsAgo), today, 300);

  const matched = candidates.filter((movie) => {
    if (seedSet.has(movie.movieCd)) return false;
    const genres = movie.genreAlt?.split(",").map((g) => g.trim()) ?? [];
    return genres.some((g) => seedGenres.has(g));
  });

  return matched.slice(0, 8).map(toRowMovie);
}

// 최근 영화: 올해 개봉작 중 최신순 20편.
export async function getRecentMoviesRow(): Promise<RowMovie[]> {
  const year = new Date().getFullYear();
  const results = await fetchOpenedBetween(`${year}-01-01`, isoDate(new Date()), 20);
  return results.map(toRowMovie);
}

// 이 달의 Best: 이번 달 개봉작 중 최신순 5편.
// (KOBIS엔 인기순 지표가 없어 "Best"는 최신 개봉순으로 대체한다.)
export async function getMonthlyBestRow(): Promise<RowMovie[]> {
  const now = new Date();
  const gte = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const lte = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(lastDay)}`;
  const results = await fetchOpenedBetween(gte, lte, 5);
  return results.map(toRowMovie);
}

// 올해의 Best: 올해 개봉작 중 최신순 10편.
export async function getYearlyBestRow(): Promise<RowMovie[]> {
  const year = new Date().getFullYear();
  const results = await fetchOpenedBetween(`${year}-01-01`, isoDate(new Date()), 10);
  return results.map(toRowMovie);
}

// N년 이내 개봉작 중 최신순. KOBIS엔 평점/인기도 지표가 없어 개봉일 최신순으로 정렬한다.
async function getRecentWithinYears(years: number, limit: number): Promise<RowMovie[]> {
  const now = new Date();
  const gte = new Date(now);
  gte.setFullYear(now.getFullYear() - years);
  const results = await fetchOpenedBetween(isoDate(gte), isoDate(now), limit);
  return results.map(toRowMovie);
}

export async function getBestOf3YearsRow(): Promise<RowMovie[]> {
  return getRecentWithinYears(3, 20);
}

export async function getBestOf5YearsRow(): Promise<RowMovie[]> {
  return getRecentWithinYears(5, 30);
}

export async function getAllTimeBestRow(): Promise<RowMovie[]> {
  const results = await searchMovieCatalog({}, 30);
  return results.map(toRowMovie);
}

// 해외 Best: 외국 영화(repNationCd=F) 중 최신순 10편.
export async function getInternationalBestRow(): Promise<RowMovie[]> {
  const results = await searchMovieCatalog({ repNationCd: "F" }, 10);
  return results.map(toRowMovie);
}

// KOBIS movieList의 genreAlt(콤마 구분 장르명)에 매칭할 키워드.
// KOBIS 장르명이 우리 탭 라벨과 표기가 달라(로맨스→멜로/로맨스, 모험→어드벤처, 공포→공포(호러))
// 후보 키워드 여러 개를 매칭한다.
const GENRE_KEYWORDS: Record<string, string[]> = {
  액션: ["액션"],
  스릴러: ["스릴러"],
  로맨스: ["멜로", "로맨스"],
  드라마: ["드라마"],
  애니메이션: ["애니메이션"],
  모험: ["어드벤처", "모험"],
  SF: ["SF"],
  공포: ["공포", "호러"],
};

export async function getGenreRow(genreLabel: string): Promise<RowMovie[]> {
  const keywords = GENRE_KEYWORDS[genreLabel];
  if (!keywords) return [];

  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const candidates = await fetchOpenedBetween(isoDate(threeYearsAgo), isoDate(new Date()), 300);

  const matched = candidates.filter((movie) =>
    keywords.some((kw) => movie.genreAlt?.includes(kw))
  );
  return matched.slice(0, 20).map(toRowMovie);
}
