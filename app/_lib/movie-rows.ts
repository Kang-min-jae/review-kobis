import {
  searchMovieCatalog,
  getMovieDetailsByCd,
  getWeeklyBoxOffice,
  getMondaysInMonth,
  searchRereleasesInRange,
  resolveRerelease,
  type KobisMovieSummary,
  type KobisRerelease,
  type CatalogSearchParams,
} from "./kobis";
import { searchKmdbMovie } from "./kmdb";

export type RowMovie = {
  id: string;
  title: string;
  posterUrl: string | null;
  gradient: string;
  isNowShowing: boolean;
  badge?: string;
};

// KOBIS 카탈로그에서 온 영화는 로컬 그라디언트가 없다. 포스터는 KMDb에서 가져오고,
// KMDb에도 없으면(오래되거나 마이너한 작품) 이 그라디언트로 대체된다.
const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

// 개봉일로부터 이 기간(일) 안이면 "현재 상영중"으로 본다 — 실제 상영 스케줄 API가
// 없어서 쓰는 근사치. 국내 극장 개봉작은 대체로 이 기간 안에 주요 상영관에서 빠진다.
const NOW_SHOWING_WINDOW_DAYS = 21;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function monthDay(isoDateStr: string): string {
  return isoDateStr.slice(5).replace("-", ".");
}

export function isRecentlyOpened(openDate: string | null): boolean {
  if (!openDate) return false;
  const diffDays = (Date.now() - new Date(openDate).getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= NOW_SHOWING_WINDOW_DAYS;
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

// KOBIS 카탈로그 항목을 화면 카드로 바꾸면서, KMDb에서 같은 제목(+개봉연도)의 포스터를 찾아 붙인다.
// 한글 제목 → 영문 제목 → 감독 필모그래피 순으로 찾아보고, 그래도 못 찾으면 KOBIS
// 상세조회로 출연진을 받아와 출연진 필모그래피로 한 번 더 찾아본다(가장 비용이 커서 마지막 수단).
export async function toRowMovie(summary: KobisMovieSummary): Promise<RowMovie> {
  let kmdb = await searchKmdbMovie(summary.title, summary.openDate?.slice(0, 4) ?? null, {
    titleEn: summary.titleEn,
    director: summary.director,
  });

  if (!kmdb) {
    const detail = await getMovieDetailsByCd(summary.movieCd);
    const cast = detail?.cast.map((c) => c.name) ?? null;
    if (cast && cast.length > 0) {
      kmdb = await searchKmdbMovie(summary.title, summary.openDate?.slice(0, 4) ?? null, {
        titleEn: summary.titleEn,
        cast,
      });
    }
  }

  return {
    id: `kobis-${summary.movieCd}`,
    title: summary.title,
    posterUrl: kmdb?.posterUrl ?? null,
    gradient: FALLBACK_GRADIENT,
    isNowShowing: isRecentlyOpened(summary.openDate),
  };
}

// 포스터를 못 찾은 영화는 카드가 빈 회색 박스로만 보여서 화면이 지저분해지고,
// 실제로는 KMDb에 등록조차 안 된 저예산/성인물일 가능성도 높아 아예 빼고 보여준다.
async function toRowMovies(summaries: KobisMovieSummary[]): Promise<RowMovie[]> {
  const rows = await Promise.all(summaries.map(toRowMovie));
  return rows.filter((row) => row.posterUrl !== null);
}

async function rereleasesToRows(rereleases: KobisRerelease[]): Promise<RowMovie[]> {
  const kmdbInfos = await Promise.all(
    rereleases.map(async (r) => {
      const yearHint = r.originalReleaseDate?.slice(0, 4) ?? null;
      let kmdb = await searchKmdbMovie(r.title, yearHint, {
        titleEn: r.titleEn,
        director: r.director,
      });
      if (!kmdb) {
        const detail = await getMovieDetailsByCd(r.movieCd);
        const cast = detail?.cast.map((c) => c.name) ?? null;
        if (cast && cast.length > 0) {
          kmdb = await searchKmdbMovie(r.title, yearHint, { titleEn: r.titleEn, cast });
        }
      }
      return kmdb;
    })
  );
  return rereleases.map((r, i) => ({
    id: `kobis-${r.movieCd}`,
    title: r.title,
    posterUrl: kmdbInfos[i]?.posterUrl ?? null,
    gradient: FALLBACK_GRADIENT,
    isNowShowing: isRecentlyOpened(r.rereleaseDate),
    badge: r.originalReleaseDate
      ? `원작 ${r.originalReleaseDate.slice(0, 4)} · 재개봉 ${monthDay(r.rereleaseDate)}`
      : `재개봉 ${monthDay(r.rereleaseDate)}`,
  }));
}

// 현재 상영중인 영화: 최근 3주 안에 개봉했고, 재개봉이 아닌(신작) 영화.
export async function getNowShowingRow(limit = 10): Promise<RowMovie[]> {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - NOW_SHOWING_WINDOW_DAYS);
  const candidates = await fetchOpenedBetween(isoDate(windowStart), isoDate(now), limit * 3);
  const checks = await Promise.all(candidates.map((m) => resolveRerelease(m)));
  const freshOnly = candidates.filter((_, i) => !checks[i].isRerelease).slice(0, limit);
  return toRowMovies(freshOnly);
}

// 재개봉 영화: 최근 3주 안에 재개봉한 영화 (원 개봉일도 같이 붙는다).
export async function getRereleaseRow(limit = 10): Promise<RowMovie[]> {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - NOW_SHOWING_WINDOW_DAYS);
  const rereleases = await searchRereleasesInRange(isoDate(windowStart), isoDate(now), limit);
  return rereleasesToRows(rereleases);
}

export type MonthlyRereleaseGroup = {
  label: string;
  movies: RowMovie[];
};

// "재개봉작" 카테고리 — 이번 달(이미 재개봉 + 이번 달 안에 예정된 것 포함)과
// 다음 달 재개봉 예정작을 월별로 묶어서 보여준다.
export async function getRereleaseCategoryRows(): Promise<MonthlyRereleaseGroup[]> {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const [thisMonth, nextMonth] = await Promise.all([
    searchRereleasesInRange(isoDate(thisMonthStart), isoDate(thisMonthEnd), 15),
    searchRereleasesInRange(isoDate(nextMonthStart), isoDate(nextMonthEnd), 15),
  ]);
  const [thisMonthRows, nextMonthRows] = await Promise.all([
    rereleasesToRows(thisMonth),
    rereleasesToRows(nextMonth),
  ]);

  return [
    { label: `${now.getFullYear()}년 ${now.getMonth() + 1}월 재개봉작`, movies: thisMonthRows },
    {
      label: `${nextMonthStart.getFullYear()}년 ${nextMonthStart.getMonth() + 1}월 재개봉 예정작`,
      movies: nextMonthRows,
    },
  ];
}

// 이번 주 박스오피스 TOP N (실제 국내 관객수 기준, KOFIC 주간 박스오피스).
// 박스오피스 항목엔 movieCd가 그대로 들어있어 별도 검색 없이 바로 카드로 연결한다.
// 포스터는 KMDb에서 제목으로 찾는데, 흔한 제목(예: "호프")은 동명의 다른 영화와
// 헷갈릴 수 있어 개봉연도를 힌트로 반드시 넘긴다 — 박스오피스 응답에 연도가
// 없으면(드묾) KOBIS 상세조회로 한 번 더 확인해서 정확한 연도를 구한다.
export async function getWeeklyBoxOfficeRow(): Promise<RowMovie[]> {
  const entries = await getWeeklyBoxOffice(10);
  const withMovieCd = entries.filter((e) => e.movieCd); // movieCd가 없으면(드묾) 평점 페이지로 연결할 방법이 없어 건너뛴다.

  // 상세조회로 개봉연도(응답에 없을 때의 보강)와 감독명(영문 제목/필모그래피 경유 검색용)을 같이 구한다.
  const details = await Promise.all(withMovieCd.map((e) => getMovieDetailsByCd(e.movieCd!)));
  const kmdbInfos = await Promise.all(
    withMovieCd.map((e, i) =>
      searchKmdbMovie(e.movieNm, e.openYear ?? details[i]?.openDate?.slice(0, 4) ?? null, {
        director: details[i]?.director?.name ?? null,
        cast: details[i]?.cast.map((c) => c.name) ?? null,
      })
    )
  );

  return withMovieCd.map((entry, i) => ({
    id: `kobis-${entry.movieCd}`,
    title: entry.movieNm,
    posterUrl: kmdbInfos[i]?.posterUrl ?? null,
    gradient: FALLBACK_GRADIENT,
    isNowShowing: true,
    badge: `${entry.rank}위 · 누적 ${entry.audiAcc.toLocaleString("ko-KR")}명`,
  }));
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
    return toRowMovies(recent);
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

  return toRowMovies(matched.slice(0, 8));
}

// 최근 영화: 올해 개봉작 중 최신순 20편.
export async function getRecentMoviesRow(): Promise<RowMovie[]> {
  const year = new Date().getFullYear();
  const results = await fetchOpenedBetween(`${year}-01-01`, isoDate(new Date()), 20);
  return toRowMovies(results);
}

// 이 달의 Best: 이번 달의 매주 박스오피스(월요일 기준)를 다 모아서, 영화별 최고
// 누적 관객수 기준으로 랭킹을 매긴다 (KOBIS엔 "이번 달 전체 흥행 순위" API가 없어서
// 주간 차트를 겹쳐 쌓는 방식으로 근사한다).
export async function getMonthlyBestRow(limit = 10): Promise<RowMovie[]> {
  const now = new Date();
  const mondays = getMondaysInMonth(now.getFullYear(), now.getMonth());
  if (mondays.length === 0) return [];

  const weeklyLists = await Promise.all(mondays.map((monday) => getWeeklyBoxOffice(10, monday)));

  const bestByMovie = new Map<string, { movieCd: string; movieNm: string; audiAcc: number }>();
  for (const week of weeklyLists) {
    for (const entry of week) {
      if (!entry.movieCd) continue;
      const existing = bestByMovie.get(entry.movieCd);
      if (!existing || entry.audiAcc > existing.audiAcc) {
        bestByMovie.set(entry.movieCd, {
          movieCd: entry.movieCd,
          movieNm: entry.movieNm,
          audiAcc: entry.audiAcc,
        });
      }
    }
  }

  const ranked = Array.from(bestByMovie.values())
    .sort((a, b) => b.audiAcc - a.audiAcc)
    .slice(0, limit);
  const details = await Promise.all(ranked.map((m) => getMovieDetailsByCd(m.movieCd)));
  const kmdbInfos = await Promise.all(
    ranked.map((m, i) =>
      searchKmdbMovie(m.movieNm, details[i]?.openDate?.slice(0, 4) ?? null, {
        director: details[i]?.director?.name ?? null,
        cast: details[i]?.cast.map((c) => c.name) ?? null,
      })
    )
  );

  return ranked.map((m, i) => ({
    id: `kobis-${m.movieCd}`,
    title: m.movieNm,
    posterUrl: kmdbInfos[i]?.posterUrl ?? null,
    gradient: FALLBACK_GRADIENT,
    isNowShowing: true,
    badge: `누적 ${m.audiAcc.toLocaleString("ko-KR")}명`,
  }));
}

// 올해의 Best: 올해 개봉작 중 최신순 10편.
export async function getYearlyBestRow(): Promise<RowMovie[]> {
  const year = new Date().getFullYear();
  const results = await fetchOpenedBetween(`${year}-01-01`, isoDate(new Date()), 10);
  return toRowMovies(results);
}

// N년 이내 개봉작 중 최신순. KOBIS엔 평점/인기도 지표가 없어 개봉일 최신순으로 정렬한다.
async function getRecentWithinYears(years: number, limit: number): Promise<RowMovie[]> {
  const now = new Date();
  const gte = new Date(now);
  gte.setFullYear(now.getFullYear() - years);
  const results = await fetchOpenedBetween(isoDate(gte), isoDate(now), limit);
  return toRowMovies(results);
}

export async function getBestOf3YearsRow(): Promise<RowMovie[]> {
  return getRecentWithinYears(3, 20);
}

export async function getBestOf5YearsRow(): Promise<RowMovie[]> {
  return getRecentWithinYears(5, 30);
}

export async function getAllTimeBestRow(): Promise<RowMovie[]> {
  const results = await searchMovieCatalog({}, 30);
  return toRowMovies(results);
}

// 해외 Best: 외국 영화(repNationCd=F) 중 최신순 10편.
export async function getInternationalBestRow(): Promise<RowMovie[]> {
  const results = await searchMovieCatalog({ repNationCd: "F" }, 10);
  return toRowMovies(results);
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
  // 포스터 없는 영화가 toRowMovies에서 빠지는 만큼 부족해지지 않도록 넉넉히 뽑아둔다.
  const rows = await toRowMovies(matched.slice(0, 40));
  return rows.slice(0, 20);
}
