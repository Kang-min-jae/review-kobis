import {
  searchMovieCatalog,
  getMovieDetailsByCd,
  getWeeklyBoxOffice,
  getMondaysInMonth,
  type KobisMovieSummary,
  type CatalogSearchParams,
} from "./kobis";
import { db } from "./db";
import { getMovieMetas } from "./movie-rate-info";

export type RowMovie = {
  id: string;
  title: string;
  posterUrl: string | null;
  gradient: string;
  isNowShowing: boolean;
  badge?: string;
  // 필모그래피(인물 페이지)에서만 채워진다 — 캐시된 필모그래피를 나중에 감사(audit)할 때
  // 개봉연도 이상 신호를 볼 수 있게 하기 위함. 다른 행(박스오피스, 장르 등)에선 안 채워도 된다.
  releaseDate?: string | null;
  // 화면에 보여줄 장르 태그(최대 2개, "액션 · 스릴러") — 포스터를 찾은 모든 카드에 채워진다.
  genre?: string | null;
  // "추천 N%" 배지 계산용 전체 장르 목록(화면엔 직접 안 쓴다) — 사용자가 남긴 평점의
  // 장르와 겹치는 비율은 클라이언트(브라우저 localStorage)만 알 수 있어서, 서버는
  // 재료(이 영화의 전체 장르)만 실어 보내고 실제 계산은 MovieCard가 한다.
  allGenres?: string[];
};

export function splitGenres(genreAlt: string | null | undefined): string[] {
  return genreAlt?.split(",").map((g) => g.trim()).filter(Boolean) ?? [];
}

export function genreFields(genreAlt: string | null | undefined): { genre: string | null; allGenres: string[] } {
  const all = splitGenres(genreAlt);
  return { genre: all.length > 0 ? all.slice(0, 2).join(" · ") : null, allGenres: all };
}

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

// KOBIS 카탈로그 항목을 화면 카드로 바꾼다. 포스터/장르는 movie-rate-info.ts의
// CachedMovie(3일 TTL 지연 캐시)를 그대로 재사용한다 — 이 캐시는 영화 상세페이지·
// 박스오피스·재개봉작 등 사이트 전체가 같이 쓰는 단일 캐시라, 한 번이라도 어디서든
// 조회된 영화는 그 뒤로 3일간 어느 행에 다시 나와도 KMDb를 또 두드리지 않는다.
// (예전엔 이 함수가 CachedMovie를 거치지 않고 매번 KMDb를 직접 검색했었는데, 그러면
// 같은 영화가 여러 행에 걸쳐 있을 때마다, 그리고 방문할 때마다 계속 다시 검색하게
// 되고, 제목 검색이 실패하면 출연진 이름을 한 명씩 순서대로 재시도하는 폴백까지
// 겹쳐 요청이 크게 늘어나는 문제가 실제로 있었다.)
// person-filmography.ts(감독 재검색 등)도 KOBIS 후보 목록 + 미리 배치 조회한 메타로
// 카드를 만들 때 이 함수를 그대로 재사용한다.
export function summaryToRowMovie(summary: KobisMovieSummary, meta: { posterUrl: string | null; genreAlt: string | null } | null): RowMovie {
  return {
    id: `kobis-${summary.movieCd}`,
    title: summary.title,
    posterUrl: meta?.posterUrl ?? null,
    gradient: FALLBACK_GRADIENT,
    isNowShowing: isRecentlyOpened(summary.openDate),
    releaseDate: summary.openDate,
    ...genreFields(meta?.genreAlt ?? summary.genreAlt),
  };
}

// 포스터를 못 찾은 영화는 카드가 빈 회색 박스로만 보여서 화면이 지저분해지고,
// 실제로는 KMDb에 등록조차 안 된 저예산/성인물일 가능성도 높아 아예 빼고 보여준다.
// getMovieMetas로 캐시 존재 여부를 한 번에 확인해서, 영화를 한 편씩 조회할 때처럼
// 편수만큼 DB 왕복이 생기지 않게 한다.
async function toRowMovies(summaries: KobisMovieSummary[]): Promise<RowMovie[]> {
  const metas = await getMovieMetas(summaries.map((s) => s.movieCd));
  const rows = summaries.map((s) => summaryToRowMovie(s, metas.get(s.movieCd) ?? null));
  return rows.filter((row) => row.posterUrl !== null);
}

// 재개봉 판정(scripts/refresh-rerelease-classifications.mts)이 이미 재개봉으로
// 확정해둔 movieCd 집합을 읽는다 — "현재 상영중인 영화"에서 재개봉작을 뺄 때 매
// 요청마다 KMDb/KOBIS를 다시 대조하지 않고 이 캐시만 조회한다. 아직 배치가 못 본
// (또는 판정을 못 내린) 영화는 "재개봉 아님"으로 취급한다 — 신작을 재개봉으로 잘못
// 숨기는 것보다, 아주 드물게 재개봉작이 신작 목록에 잠깐 섞이는 쪽이 안전하다.
async function findKnownRereleaseMovieCds(movieCds: string[]): Promise<Set<string>> {
  if (movieCds.length === 0) return new Set();
  const rows = await db.rereleaseClassification.findMany({
    where: { movieCd: { in: movieCds }, isRerelease: true },
    select: { movieCd: true },
  });
  return new Set(rows.map((r) => r.movieCd));
}

// 현재 상영중인 영화: 최근 3주 안에 개봉했고, 재개봉이 아닌(신작) 영화.
export async function getNowShowingRow(limit = 10): Promise<RowMovie[]> {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - NOW_SHOWING_WINDOW_DAYS);
  const candidates = await fetchOpenedBetween(isoDate(windowStart), isoDate(now), limit * 3);
  const rereleaseCds = await findKnownRereleaseMovieCds(candidates.map((c) => c.movieCd));
  const freshOnly = candidates.filter((c) => !rereleaseCds.has(c.movieCd)).slice(0, limit);
  return toRowMovies(freshOnly);
}

type RereleaseClassificationRow = Awaited<ReturnType<typeof db.rereleaseClassification.findMany>>[number];

// 포스터 없는 영화는 다른 행과 같은 정책으로 아예 뺀다(빈 회색 박스 방지) — 그래서
// 결과 배열이 rows보다 짧아질 수 있다. row(정렬/필터에 쓸 원본 판정 데이터)와
// movie(화면용 카드)를 짝지어 반환해서, 나중에 인덱스로 다시 매칭할 필요가 없게 한다.
async function classificationsToRows(
  rows: RereleaseClassificationRow[]
): Promise<{ row: RereleaseClassificationRow; movie: RowMovie }[]> {
  const metas = await getMovieMetas(rows.map((r) => r.movieCd));
  const result: { row: RereleaseClassificationRow; movie: RowMovie }[] = [];
  rows.forEach((r) => {
    const meta = metas.get(r.movieCd) ?? null;
    if (!meta?.posterUrl) return;
    const badge = r.originalYear && r.rereleaseDate
      ? `원작 ${r.originalYear} · 재개봉 ${monthDay(r.rereleaseDate)}`
      : r.rereleaseDate
        ? `재개봉 ${monthDay(r.rereleaseDate)}`
        : undefined;
    result.push({
      row: r,
      movie: {
        id: `kobis-${r.movieCd}`,
        title: r.movieTitle,
        posterUrl: meta.posterUrl,
        gradient: FALLBACK_GRADIENT,
        isNowShowing: isRecentlyOpened(r.rereleaseDate),
        badge,
        ...genreFields(meta.genreAlt),
      },
    });
  });
  return result;
}

export type RereleaseGroup = {
  label: string;
  movies: RowMovie[];
};

// "재개봉작" 카테고리 — scripts/refresh-rerelease-classifications.mts가 하루 1회
// 배치로 미리 판정해 RereleaseClassification에 저장해둔 값만 읽는다(요청마다
// KOFIC+KMDb를 대조하는 비용 큰 판정을 다시 하지 않는다). 최근 재개봉일순 /
// 누적 관객수순(박스오피스에 없으면 제외) / 원작 연도가 오래된 순(고전 재개봉작)
// 세 그룹으로 나눠 보여준다. genreLabel을 주면(카테고리 내비게이션의 장르 탭) 그
// 장르가 있는 영화만 걸러서 보여준다.
export async function getRereleaseCategoryRows(genreLabel: string = "전체"): Promise<RereleaseGroup[]> {
  const keywords = genreLabel === "전체" ? null : GENRE_KEYWORDS[genreLabel];
  if (genreLabel !== "전체" && !keywords) return [];

  const allRows = await db.rereleaseClassification.findMany({
    where: { isRerelease: true, status: "classified" },
  });

  // 장르 필터는 배치가 이미 저장해둔 row.genreAlt로 DB 조회 단계에서 바로 걸러낸다 —
  // classificationsToRows(포스터 조회를 위해 movie-rate-info.ts 캐시를 부르고, 캐시가
  // 없으면 KMDb/KOBIS에 새로 조회함)를 전체 재개봉작에 대해 다 부르면 후보가 많을 때
  // (특히 --since 백필로 늘어난 경우) 요청 한 번에 수십~수백 번 외부 API를 두드리게
  // 되어 실제로 문제가 됐었다 — 그래서 정렬·10편 제한까지 다 끝낸 뒤에만 필요한
  // 만큼(그룹당 최대 15편)만 카드로 바꾼다.
  const rows = keywords
    ? allRows.filter((r) => splitGenres(r.genreAlt).some((g) => keywords.includes(g)))
    : allRows;

  const byRecency = [...rows].sort((a, b) => (b.rereleaseDate ?? "").localeCompare(a.rereleaseDate ?? ""));
  const byPopularity = rows
    .filter((r) => r.audiAcc !== null && r.audiAcc > 0)
    .sort((a, b) => (b.audiAcc ?? 0) - (a.audiAcc ?? 0));
  const byClassic = [...rows]
    .filter((r) => r.originalYear !== null)
    .sort((a, b) => (a.originalYear ?? "9999").localeCompare(b.originalYear ?? "9999"));

  // 포스터 없는 영화가 classificationsToRows에서 걸러질 걸 감안해 넉넉히(15편) 뽑은
  // 뒤, 최종적으로 화면엔 각 그룹 10편까지만 보여준다.
  const [recent, popular, classics] = await Promise.all([
    classificationsToRows(byRecency.slice(0, 15)),
    classificationsToRows(byPopularity.slice(0, 15)),
    classificationsToRows(byClassic.slice(0, 15)),
  ]);

  return [
    { label: "최근 재개봉작", movies: recent.slice(0, 10).map((x) => x.movie) },
    { label: "인기 재개봉작", movies: popular.slice(0, 10).map((x) => x.movie) },
    { label: "재개봉 명작", movies: classics.slice(0, 10).map((x) => x.movie) },
  ].filter((group) => group.movies.length > 0);
}

// 재개봉 영화 소개용 짧은 행(현재상영중 탭) — 최근 재개봉일순 상위 N편.
export async function getRereleaseRow(limit = 10): Promise<RowMovie[]> {
  const rows = await db.rereleaseClassification.findMany({
    where: { isRerelease: true, status: "classified" },
    orderBy: { rereleaseDate: "desc" },
    take: limit * 2, // 포스터 없는 영화가 걸러질 걸 감안해 넉넉히 가져온다.
  });
  const converted = await classificationsToRows(rows);
  return converted.slice(0, limit).map((x) => x.movie);
}

// 박스오피스류 랭킹(주간 TOP10, 이달의 Best)은 순위 계산 자체가 KOBIS 여러 번
// 호출 + 영화마다 KMDb 검색까지 필요해서 비싸다. 순위는 하루에 몇 번 안 바뀌니
// 이 시간(12시간)마다만 다시 계산하고, 그 사이엔 RankingSnapshot에 저장해둔
// 값을 그대로 읽는다(배치 동기화).
const RANKING_SYNC_INTERVAL_MS = 1000 * 60 * 60 * 12;

type RankingEntry = { rank: number; movieCd: string; movieTitle: string; audiAcc: number };

async function readRankingSnapshot(listType: string): Promise<RankingEntry[] | null> {
  const rows = await db.rankingSnapshot.findMany({ where: { listType }, orderBy: { rank: "asc" } });
  if (rows.length === 0) return null;
  const isFresh = Date.now() - rows[0].syncedAt.getTime() < RANKING_SYNC_INTERVAL_MS;
  if (!isFresh) return null;
  return rows;
}

async function writeRankingSnapshot(listType: string, entries: RankingEntry[]): Promise<void> {
  await db.$transaction([
    db.rankingSnapshot.deleteMany({ where: { listType } }),
    db.rankingSnapshot.createMany({
      data: entries.map((e) => ({ ...e, listType })),
    }),
  ]);
}

// 순위(랭킹 스냅샷)만으로 화면 카드를 만든다. 포스터는 movie-rate-info.ts의
// 영화 상세정보 캐시를 그대로 재사용한다 — 인기작이라 어차피 평점 페이지에서도
// 자주 조회돼 캐시가 겹친다.
async function rankingRowsToCards(entries: RankingEntry[], badgeOf: (e: RankingEntry) => string) {
  const metas = await getMovieMetas(entries.map((e) => e.movieCd));
  return entries.map((entry) => {
    const meta = metas.get(entry.movieCd) ?? null;
    return {
      id: `kobis-${entry.movieCd}`,
      title: entry.movieTitle,
      posterUrl: meta?.posterUrl ?? null,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: true,
      badge: badgeOf(entry),
      ...genreFields(meta?.genreAlt),
    };
  });
}

// 이번 주 박스오피스 TOP N (실제 국내 관객수 기준, KOFIC 주간 박스오피스).
async function fetchWeeklyBoxOfficeRanking(): Promise<RankingEntry[]> {
  const entries = await getWeeklyBoxOffice(10);
  return entries
    .filter((e): e is typeof e & { movieCd: string } => Boolean(e.movieCd)) // movieCd가 없으면(드묾) 평점 페이지로 연결할 방법이 없어 건너뛴다.
    .map((e) => ({ rank: e.rank, movieCd: e.movieCd, movieTitle: e.movieNm, audiAcc: e.audiAcc }));
}

export async function getWeeklyBoxOfficeRow(): Promise<RowMovie[]> {
  let ranking = await readRankingSnapshot("weekly_box_office");
  if (!ranking) {
    ranking = await fetchWeeklyBoxOfficeRanking();
    await writeRankingSnapshot("weekly_box_office", ranking);
  }
  return rankingRowsToCards(
    ranking,
    (e) => `${e.rank}위 · 누적 ${e.audiAcc.toLocaleString("ko-KR")}명`
  );
}

// 평가한 영화들의 장르를 모은 집합 — "추천 N%" 배지(이 영화의 장르 중 몇 %가 내가
// 남긴 평점의 장르와 겹치는지)는 사용자의 평점(localStorage, 브라우저에만 있음)이
// 있어야 계산할 수 있어서, 서버는 재료(각 영화의 allGenres)만 실어 보내고 실제 겹침
// 계산은 클라이언트(MovieCard, /api/seed-genres로 이 함수를 불러 얻은 값 사용)가 한다.
export async function computeSeedGenres(seedMovieCds: string[]): Promise<string[]> {
  const seedDetails = await Promise.all(seedMovieCds.map((cd) => getMovieDetailsByCd(cd)));
  const seedGenres = new Set<string>();
  for (const detail of seedDetails) {
    for (const g of splitGenres(detail?.genreAlt)) seedGenres.add(g);
  }
  return Array.from(seedGenres);
}

// "사용자 추천 영화" — KOBIS엔 추천 API가 없어서, 내가 높게 평가한 영화들의 장르를 모아
// 같은 장르를 가진 최근 개봉작을 추천으로 보여준다 (평가한 영화 자체는 제외).
// 평가한 영화가 아직 없으면 최근 두 달 개봉작으로 대체. "추천 N%" 배지는 여기서 안
// 붙인다 — toRowMovie가 채운 allGenres를 갖고 MovieCard가 클라이언트에서 계산한다.
export async function getRecommendedForRatedRow(seedMovieCds: string[]): Promise<RowMovie[]> {
  const today = isoDate(new Date());

  if (seedMovieCds.length === 0) {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
    const recent = await fetchOpenedBetween(isoDate(twoMonthsAgo), today, 8);
    return toRowMovies(recent);
  }

  const seedGenreList = await computeSeedGenres(seedMovieCds);
  if (seedGenreList.length === 0) return [];
  const seedGenres = new Set(seedGenreList);

  const seedSet = new Set(seedMovieCds);
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const candidates = await fetchOpenedBetween(isoDate(twoYearsAgo), today, 300);

  const matched = candidates.filter((movie) => {
    if (seedSet.has(movie.movieCd)) return false;
    const genres = splitGenres(movie.genreAlt);
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
async function fetchMonthlyBestRanking(limit: number): Promise<RankingEntry[]> {
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

  return Array.from(bestByMovie.values())
    .sort((a, b) => b.audiAcc - a.audiAcc)
    .slice(0, limit)
    .map((m, i) => ({ rank: i + 1, movieCd: m.movieCd, movieTitle: m.movieNm, audiAcc: m.audiAcc }));
}

export async function getMonthlyBestRow(limit = 10): Promise<RowMovie[]> {
  let ranking = await readRankingSnapshot("monthly_best");
  if (!ranking) {
    ranking = await fetchMonthlyBestRanking(limit);
    await writeRankingSnapshot("monthly_best", ranking);
  }
  return rankingRowsToCards(ranking, (e) => `누적 ${e.audiAcc.toLocaleString("ko-KR")}명`);
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
  코미디: ["코미디"],
  범죄: ["범죄"],
  판타지: ["판타지"],
  미스터리: ["미스터리"],
  다큐멘터리: ["다큐멘터리", "다큐"],
  뮤지컬: ["뮤지컬"],
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

// 사용자 인기영화: 이 사이트에서 평점을 가장 많이 받은 영화 순서로 최대 limit편을 반환한다.
// genreFilter가 있으면 그 장르에 속하는 영화만 남긴다 — 각 장르 섹션에서 "이 장르 내 인기"를
// 보여줄 때 쓴다. 평점 데이터가 충분하지 않으면 빈 배열을 돌려줘서 행 자체를 숨긴다.
export async function getUserPopularMoviesRow(
  genreFilter?: string,
  limit = 10
): Promise<RowMovie[]> {
  // CategoryRating.movieCd는 순수 KOBIS 코드(숫자만)다. 시리즈("tmdb-tv-*") 평점은
  // 여기서 제외하기 위해 숫자로만 이루어진 코드만 취한다.
  const topRated = await db.categoryRating.groupBy({
    by: ["movieCd"],
    _count: { movieCd: true },
    orderBy: { _count: { movieCd: "desc" } },
    take: genreFilter ? 200 : limit * 3, // 장르 필터링 여지를 두고 넉넉히 가져온다
  });

  const movieCds = topRated
    .map((r) => r.movieCd)
    .filter((cd) => /^\d+$/.test(cd)); // 숫자 KOBIS 코드만

  if (movieCds.length === 0) return [];

  const metas = await getMovieMetas(movieCds);

  const rows: RowMovie[] = [];
  for (const cd of movieCds) {
    const meta = metas.get(cd) ?? null;
    if (!meta?.posterUrl) continue;

    // 장르 필터: genreFilter가 있으면 GENRE_KEYWORDS 기준으로 걸러낸다
    if (genreFilter) {
      const keywords = GENRE_KEYWORDS[genreFilter] ?? [];
      const hasGenre = keywords.some((kw) => meta.genreAlt?.includes(kw));
      if (!hasGenre) continue;
    }

    rows.push({
      id: `kobis-${cd}`,
      title: metas.get(cd)?.movieTitle ?? cd,
      posterUrl: meta.posterUrl,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: false,
      ...genreFields(meta.genreAlt),
    });

    if (rows.length >= limit) break;
  }

  return rows;
}
