import { unstable_cache } from "next/cache";
import {
  searchMovieCatalog,
  getMovieDetailsByCd,
  getWeeklyBoxOffice,
  getDailyBoxOfficeList,
  getMondaysInMonth,
  type KobisMovieSummary,
  type CatalogSearchParams,
} from "./kobis";
import { db } from "./db";
import { getMovieMetas, getCachedMovieMetas, type MovieMeta } from "./movie-rate-info";
import { formatPosterUrl } from "./formatPosterUrl";
import { getBulkMovieRatingAverages } from "./review-data";
import { isAdultContent, isAdultGenre, NOT_ADULT_GENRE_WHERE } from "./adult-content";

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
  // 개인화 추천 알고리즘이 계산한 추천 점수(0~100). 이 값이 있으면 matchBadge 대신 쓴다.
  recommendScore?: number;
  // LLM이 생성한 추천 이유 한 줄 — genre 필드 대신 카드 하단에 표시한다.
  recommendReason?: string;
  // 아카데미/칸/베를린/베니스 주요 시상식 수상 이력이 있으면 트로피 배지를 보여준다.
  awardBadge?: true;
  // 수상 내역 상세 — 툴팁 및 +N 뱃지용.
  festivalAwards?: FestivalAward[];
  // 서버에서 집계한 플랫폼 평균 — 한줄평(0~10), 장문평(0~100). 없으면 null.
  shortAvg?: number | null;
  longAvg?: number | null;
  // 한줄평(전체)에 평점을 남긴 사람 수
  shortCount?: number | null;
};

export type FestivalAward = { festival: string; categoryLabel: string; year: number };

export function splitGenres(genreAlt: string | string[] | { name: string }[] | null | undefined): string[] {
  if (!genreAlt) return [];
  if (Array.isArray(genreAlt)) {
    return (genreAlt as (string | { name: string })[])
      .map((g) => (typeof g === "string" ? g : g?.name ?? ""))
      .map((g) => g.trim())
      .filter(Boolean);
  }
  return (genreAlt as string).split(",").map((g) => g.trim()).filter(Boolean);
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
    posterUrl: formatPosterUrl(meta?.posterUrl ?? null),
    gradient: FALLBACK_GRADIENT,
    isNowShowing: isRecentlyOpened(summary.openDate),
    releaseDate: summary.openDate,
    ...genreFields(meta?.genreAlt ?? summary.genreAlt),
  };
}

// 아카데미/칸/베를린/베니스 수상작 tmdbId → 수상 내역 맵을 DB에서 읽어 캐시한다.
// CachedAwardWinners.id 가 festival 종류("academy"|"cannes"|"berlin"|"venice")이고
// winners JSON 배열에 tmdbId, categoryLabel, ceremonyYear 가 들어 있다.
type FestivalWinnerJson = { tmdbId?: string | null; categoryLabel?: string; ceremonyYear?: number };
let awardDetailCache: Map<string, FestivalAward[]> | null = null; // tmdbId → awards
let awardCacheUpdatedAt = 0;
const AWARD_CACHE_TTL = 10 * 60 * 1000; // 10분

async function getAwardDetailsByTmdbId(): Promise<Map<string, FestivalAward[]>> {
  if (awardDetailCache && Date.now() - awardCacheUpdatedAt < AWARD_CACHE_TTL) {
    return awardDetailCache;
  }
  try {
    const rows = await db.cachedAwardWinners.findMany({ select: { id: true, winners: true } });
    const byTmdbId = new Map<string, FestivalAward[]>();
    for (const row of rows) {
      const winners = row.winners as FestivalWinnerJson[];
      if (!Array.isArray(winners)) continue;
      // "academy-v3" → "academy" (버전 접미사 제거)
      const festival = row.id.replace(/-v\d+$/, "");
      for (const w of winners) {
        if (!w.tmdbId) continue;
        const list = byTmdbId.get(w.tmdbId) ?? [];
        const award: FestivalAward = { festival, categoryLabel: w.categoryLabel ?? "", year: w.ceremonyYear ?? 0 };
        // 동일 festival+year+category 중복 방지
        const isDup = list.some((a) => a.festival === award.festival && a.year === award.year && a.categoryLabel === award.categoryLabel);
        if (!isDup) list.push(award);
        byTmdbId.set(w.tmdbId, list);
      }
    }
    awardDetailCache = byTmdbId;
    awardCacheUpdatedAt = Date.now();
    return byTmdbId;
  } catch {
    return new Map();
  }
}

// movieCd 배열 → movieCd별 수상 내역 맵. CachedMovie.tmdbId를 기준으로 교차.
async function findAwardWinnerMovieCds(movieCds: string[]): Promise<Map<string, FestivalAward[]>> {
  if (movieCds.length === 0) return new Map();
  const byTmdbId = await getAwardDetailsByTmdbId();
  if (byTmdbId.size === 0) return new Map();

  const rows = await db.cachedMovie.findMany({
    where: { movieCd: { in: movieCds }, tmdbId: { in: Array.from(byTmdbId.keys()) } },
    select: { movieCd: true, tmdbId: true },
  });

  const result = new Map<string, FestivalAward[]>();
  for (const row of rows) {
    if (!row.tmdbId) continue;
    const awards = byTmdbId.get(row.tmdbId);
    if (awards) result.set(row.movieCd, awards);
  }
  return result;
}

// 포스터를 못 찾은 영화는 카드가 빈 회색 박스로만 보여서 화면이 지저분해지고,
// 실제로는 KMDb에 등록조차 안 된 저예산/성인물일 가능성도 높아 아예 빼고 보여준다.
// getMovieMetas로 캐시 존재 여부를 한 번에 확인해서, 영화를 한 편씩 조회할 때처럼
// 편수만큼 DB 왕복이 생기지 않게 한다.
async function toRowMovies(summaries: KobisMovieSummary[]): Promise<RowMovie[]> {
  const movieCds = summaries.map((s) => s.movieCd);
  const [metas, awardMap, avgMap] = await Promise.all([
    getMovieMetas(movieCds),
    findAwardWinnerMovieCds(movieCds),
    getBulkMovieRatingAverages(movieCds),
  ]);
  const rows = summaries.filter((s) => !isAdultContent({ title: s.title, genreAlt: metas.get(s.movieCd)?.genreAlt })).map((s) => {
    const awards = awardMap.get(s.movieCd);
    const avgs = avgMap.get(s.movieCd);
    return {
      ...summaryToRowMovie(s, metas.get(s.movieCd) ?? null),
      ...(awards ? { awardBadge: true as const, festivalAwards: awards } : {}),
      shortAvg: avgs?.shortAvg ?? null,
      shortCount: avgs?.shortCount ?? null,
      longAvg: avgs?.longAvg ?? null,
    };
  });
  return rows;
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

// 현재 상영중인 영화: 최근 3일 일별 박스오피스를 합쳐 실제 상영관에 올라 있는 영화 15편.
// 일별 TOP10씩 최대 3일치를 합산하면 중복 제거 후 최대 ~20편의 고유 영화가 나온다.
async function _getNowShowingRow(limit = 15): Promise<RowMovie[]> {
  const [day1, day2, day3] = await Promise.all([
    getDailyBoxOfficeList(1),
    getDailyBoxOfficeList(2),
    getDailyBoxOfficeList(3),
  ]);

  const seen = new Set<string>();
  const merged: KobisMovieSummary[] = [];
  for (const entry of [...day1, ...day2, ...day3]) {
    if (!entry.movieCd || seen.has(entry.movieCd)) continue;
    seen.add(entry.movieCd);
    merged.push({
      movieCd: entry.movieCd,
      title: entry.movieNm,
      titleEn: null,
      openDate: entry.openDate,
      nationAlt: null,
      genreAlt: null,
      isForeign: false,
      director: null,
    });
  }

  const rereleaseCds = await findKnownRereleaseMovieCds(merged.map((m) => m.movieCd));
  const freshOnly = merged.filter((m) => !rereleaseCds.has(m.movieCd));
  const rows = await toRowMovies(freshOnly.slice(0, limit * 2));
  // 박스오피스에 실제로 올라 있는 영화는 openDate 포맷에 관계없이 상영중으로 강제 표시.
  return rows.slice(0, limit).map((r) => ({ ...r, isNowShowing: true }));
}
export const getNowShowingRow = unstable_cache(
  _getNowShowingRow,
  ["now-showing-row-v2"],
  { revalidate: 60 * 60, tags: ["movie-rows"] },
);

type RereleaseClassificationRow = Awaited<ReturnType<typeof db.rereleaseClassification.findMany>>[number];

// 포스터 없는 영화는 다른 행과 같은 정책으로 아예 뺀다(빈 회색 박스 방지) — 그래서
// 결과 배열이 rows보다 짧아질 수 있다. row(정렬/필터에 쓸 원본 판정 데이터)와
// movie(화면용 카드)를 짝지어 반환해서, 나중에 인덱스로 다시 매칭할 필요가 없게 한다.
async function classificationsToRows(
  rows: RereleaseClassificationRow[]
): Promise<{ row: RereleaseClassificationRow; movie: RowMovie }[]> {
  const movieCds = rows.map((r) => r.movieCd);
  const [metas, awardCds, avgMap] = await Promise.all([
    getMovieMetas(movieCds),
    findAwardWinnerMovieCds(movieCds),
    getBulkMovieRatingAverages(movieCds),
  ]);
  const result: { row: RereleaseClassificationRow; movie: RowMovie }[] = [];
  rows.forEach((r) => {
    const meta = metas.get(r.movieCd) ?? null;
    if (!meta?.posterUrl || isAdultGenre(meta.genreAlt)) return;
    const badge = r.originalYear && r.rereleaseDate
      ? `원작 ${r.originalYear} · 재개봉 ${monthDay(r.rereleaseDate)}`
      : r.rereleaseDate
        ? `재개봉 ${monthDay(r.rereleaseDate)}`
        : undefined;
    const avgs = avgMap.get(r.movieCd);
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
        ...(awardCds.has(r.movieCd) ? { awardBadge: true as const } : {}),
        shortAvg: avgs?.shortAvg ?? null,
        shortCount: avgs?.shortCount ?? null,
        longAvg: avgs?.longAvg ?? null,
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
async function _getRereleaseRow(limit = 10): Promise<RowMovie[]> {
  const rows = await db.rereleaseClassification.findMany({
    where: { isRerelease: true, status: "classified" },
    orderBy: { rereleaseDate: "desc" },
    take: limit * 2, // 포스터 없는 영화가 걸러질 걸 감안해 넉넉히 가져온다.
  });
  const converted = await classificationsToRows(rows);
  return converted.slice(0, limit).map((x) => x.movie);
}
export const getRereleaseRow = unstable_cache(
  _getRereleaseRow,
  ["rerelease-row-v2"],
  { revalidate: 60 * 60, tags: ["movie-rows"] },
);

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
  const movieCds = entries.map((e) => e.movieCd);
  const [metas, awardCds, avgMap] = await Promise.all([
    getMovieMetas(movieCds),
    findAwardWinnerMovieCds(movieCds),
    getBulkMovieRatingAverages(movieCds),
  ]);
  return entries.filter((e) => !isAdultGenre(metas.get(e.movieCd)?.genreAlt)).map((entry) => {
    const meta = metas.get(entry.movieCd) ?? null;
    const avgs = avgMap.get(entry.movieCd);
    return {
      id: `kobis-${entry.movieCd}`,
      title: entry.movieTitle,
      posterUrl: meta?.posterUrl ?? null,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: true,
      badge: badgeOf(entry),
      ...genreFields(meta?.genreAlt),
      ...(awardCds.has(entry.movieCd) ? { awardBadge: true as const } : {}),
      shortAvg: avgs?.shortAvg ?? null,
      shortCount: avgs?.shortCount ?? null,
      longAvg: avgs?.longAvg ?? null,
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

async function _getWeeklyBoxOfficeRow(): Promise<RowMovie[]> {
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
// 순위 자체는 12시간 스냅샷이지만, 카드 조립(메타·수상·평균 조회)은 매 요청 DB를 여러 번
// 왕복했다. 결과 카드를 30분 캐시해 홈 화면 방문마다 DB에 가는 일을 없앤다.
export const getWeeklyBoxOfficeRow = unstable_cache(
  _getWeeklyBoxOfficeRow,
  ["weekly-box-office-row"],
  { revalidate: 60 * 30, tags: ["movie-rows"] },
);

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

// 최근 영화: 최근 3달(90일) 개봉작 최신순 15편.
export const getRecentMoviesRow = unstable_cache(
  async (): Promise<RowMovie[]> => {
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setDate(now.getDate() - 90);
    const results = await fetchOpenedBetween(isoDate(threeMonthsAgo), isoDate(now), 30);
    const rows = await toRowMovies(results);
    return rows.slice(0, 15);
  },
  ["recent-movies-row-v3"],
  { revalidate: 60 * 60, tags: ["movie-rows"] },
);

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

async function _getMonthlyBestRow(limit = 10): Promise<RowMovie[]> {
  let ranking = await readRankingSnapshot("monthly_best");
  if (!ranking) {
    ranking = await fetchMonthlyBestRanking(limit);
    await writeRankingSnapshot("monthly_best", ranking);
  }
  return rankingRowsToCards(ranking, () => "");
}
export const getMonthlyBestRow = unstable_cache(
  _getMonthlyBestRow,
  ["monthly-best-row"],
  { revalidate: 60 * 30, tags: ["movie-rows"] },
);

type RatedMovie = { cd: string; meta: MovieMeta; avg: number; count: number };

// 평점이 달린 KOBIS 영화 전체를 평점 높은 순(동점이면 평점 수 많은 순)으로 돌려준다.
// 메타는 DB 캐시만 읽는다 — 여기서 getMovieMetas를 쓰면 만료된 영화마다 외부 API
// 재조회가 줄을 서서 Best 행이 제한 시간 안에 끝나지 못하고 화면에서 사라진다.
async function loadRatedMovies(): Promise<RatedMovie[]> {
  const allRatings = await db.categoryRating.groupBy({
    by: ["movieCd"],
    where: { category: "전체" },
    _avg: { score: true },
    _count: { _all: true },
  });
  const ratings = allRatings.filter((r) => /^\d+$/.test(r.movieCd)); // 숫자 KOBIS 코드만(시리즈 제외)
  const metas = await getCachedMovieMetas(ratings.map((r) => r.movieCd));
  return ratings
    .flatMap((r) => {
      const meta = metas.get(r.movieCd);
      if (!meta || isAdultContent({ title: meta.movieTitle, genreAlt: meta.genreAlt })) return [];
      return [{ cd: r.movieCd, meta, avg: r._avg.score ?? 0, count: r._count._all }];
    })
    .sort((a, b) => (a.avg !== b.avg ? b.avg - a.avg : b.count - a.count));
}

async function ratedToRows(rated: RatedMovie[]): Promise<RowMovie[]> {
  const avgMap = await getBulkMovieRatingAverages(rated.map((r) => r.cd));
  return rated.map(({ cd, meta }) => {
    const avgs = avgMap.get(cd);
    return {
      id: `kobis-${cd}`,
      title: meta.movieTitle,
      posterUrl: meta.posterUrl,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: isRecentlyOpened(meta.releaseDate),
      releaseDate: meta.releaseDate,
      ...genreFields(meta.genreAlt),
      shortAvg: avgs?.shortAvg ?? null,
      shortCount: avgs?.shortCount ?? null,
      longAvg: avgs?.longAvg ?? null,
    };
  });
}

// 평점 영화로 자리를 다 못 채우면 KOBIS 후보로 보충한다. 이미 포스터가 캐시된 영화를
// 먼저 쓰고, 그래도 모자라면 최대 FILL_FETCH_CAP편만 외부 조회한다(비용 상한).
const FILL_FETCH_CAP = 10;

async function fillWithUnrated(
  pool: KobisMovieSummary[],
  exclude: Set<string>,
  needed: number,
): Promise<RowMovie[]> {
  const unseen = pool.filter((m) => !exclude.has(m.movieCd));
  if (needed <= 0 || unseen.length === 0) return [];
  const cached = await getCachedMovieMetas(unseen.map((m) => m.movieCd));
  const candidates = unseen.filter((m) => !isAdultGenre(cached.get(m.movieCd)?.genreAlt));
  const withPoster = candidates.filter((m) => cached.get(m.movieCd)?.posterUrl).slice(0, needed);
  const rows = withPoster.map((m) => summaryToRowMovie(m, cached.get(m.movieCd) ?? null));
  if (rows.length >= needed) return rows;
  const used = new Set(withPoster.map((m) => m.movieCd));
  const rest = candidates
    .filter((m) => !used.has(m.movieCd))
    .slice(0, Math.min(needed - rows.length, FILL_FETCH_CAP));
  return [...rows, ...(await toRowMovies(rest))];
}

function matchesGenre(genreAlt: string | null | undefined, keywords: string[] | null): boolean {
  return !keywords || keywords.some((kw) => genreAlt?.includes(kw));
}

// 장르 행을 평점 영화만으로 다 못 채울 때, 이미 저장된 그 장르 영화(포스터 있는 것)를
// 최신 개봉순으로 가져와 채운다 — 외부 API 없이 DB만 읽는다.
async function fillFromCachedGenre(
  keywords: string[],
  range: { gte: string; lte: string } | null,
  exclude: Set<string>,
  needed: number,
): Promise<RowMovie[]> {
  if (needed <= 0) return [];
  const rows = await db.cachedMovie.findMany({
    where: {
      posterUrl: { not: null },
      NOT: { movieCd: { startsWith: "wikidata-" } },
      AND: [
        { OR: keywords.map((kw) => ({ genreAlt: { contains: kw } })) },
        NOT_ADULT_GENRE_WHERE,
        range
          ? { releaseDate: { gte: range.gte, lte: range.lte } }
          : { OR: [{ releaseDate: null }, { releaseDate: { lte: isoDate(new Date()) } }] },
      ],
    },
    orderBy: { releaseDate: { sort: "desc", nulls: "last" } },
    take: needed + exclude.size,
    select: { movieCd: true, title: true, posterUrl: true, releaseDate: true, genreAlt: true },
  });
  return rows
    .filter((m) => !exclude.has(m.movieCd))
    .slice(0, needed)
    .map((m) => ({
      id: /^\d+$/.test(m.movieCd) ? `kobis-${m.movieCd}` : m.movieCd,
      title: m.title,
      posterUrl: formatPosterUrl(m.posterUrl),
      gradient: FALLBACK_GRADIENT,
      isNowShowing: isRecentlyOpened(m.releaseDate),
      releaseDate: m.releaseDate,
      ...genreFields(m.genreAlt),
    }));
}

// 날짜 범위 내 영화를 DB 평점 높은 순(동점이면 평점 수 많은 순)으로 정렬해 반환.
// CachedMovie.releaseDate로 범위를 거르므로 KOBIS 카탈로그 풀의 순서·개수에 의존하지
// 않는다. 평점 있는 영화를 먼저 채우고, 자리가 남으면 평점 없는 KOBIS 영화로 보충한다.
async function getRatingSortedMovies(
  openDateGte: string,
  openDateLte: string,
  limit: number,
  keywords: string[] | null = null,
): Promise<RowMovie[]> {
  const rated = await loadRatedMovies();
  const inRange = rated
    .filter((r) => r.meta.releaseDate && r.meta.releaseDate >= openDateGte && r.meta.releaseDate <= openDateLte)
    .filter((r) => matchesGenre(r.meta.genreAlt, keywords))
    .slice(0, limit);
  const rows = await ratedToRows(inRange);
  if (rows.length >= limit) return rows;

  const exclude = new Set(rated.map((r) => r.cd));
  if (keywords) {
    rows.push(...(await fillFromCachedGenre(keywords, { gte: openDateGte, lte: openDateLte }, exclude, limit - rows.length)));
    if (rows.length >= limit) return rows;
    for (const r of rows) exclude.add(r.id.replace(/^kobis-/, ""));
  }
  const needed = limit - rows.length;
  const pool = (await fetchOpenedBetween(openDateGte, openDateLte, needed * 4 + exclude.size)
    .catch(() => [] as KobisMovieSummary[])).filter((m) => matchesGenre(m.genreAlt, keywords));
  let fill = await fillWithUnrated(pool, exclude, needed);
  if (fill.length === 0) {
    const globalPool = (await searchMovieCatalog({}, needed * 2).catch(() => [] as KobisMovieSummary[]))
      .filter((m) => matchesGenre(m.genreAlt, keywords));
    fill = await fillWithUnrated(globalPool, exclude, needed);
  }
  return [...rows, ...fill.slice(0, needed)];
}

// 올해의 Best: 올해 개봉작 중 DB 평점 높은 순 10편.
export const getYearlyBestRow = unstable_cache(
  async (): Promise<RowMovie[]> => {
    const year = new Date().getFullYear();
    return getRatingSortedMovies(`${year}-01-01`, isoDate(new Date()), 10);
  },
  ["yearly-best-row"],
  { revalidate: 60 * 60 * 6, tags: ["movie-rows"] },
);

// 3년 Best: 현재 연도 포함 최근 3개 연도(예: 2024~2026) 개봉작 중 DB 평점 높은 순 15편.
// "최근 3년"의 시작은 (currentYear - 2)년 1월 1일 — 연도 경계를 기준으로 삼아
// 같은 해 개봉작이 카테고리마다 다르게 포함/제외되는 혼란을 없앤다.
export const getBestOf3YearsRow = unstable_cache(
  async (): Promise<RowMovie[]> => {
    const year = new Date().getFullYear();
    return getRatingSortedMovies(`${year - 2}-01-01`, isoDate(new Date()), 15);
  },
  ["best-of-3-years-row"],
  { revalidate: 60 * 60 * 6, tags: ["movie-rows"] },
);

// 5년 Best: 현재 연도 포함 최근 5개 연도(예: 2022~2026) 개봉작 중 DB 평점 높은 순 20편.
// 시작 = (currentYear - 4)년 1월 1일.
export const getBestOf5YearsRow = unstable_cache(
  async (): Promise<RowMovie[]> => {
    const year = new Date().getFullYear();
    return getRatingSortedMovies(`${year - 4}-01-01`, isoDate(new Date()), 20);
  },
  ["best-of-5-years-row"],
  { revalidate: 60 * 60 * 6, tags: ["movie-rows"] },
);

// 역대 Best: 연도 제한 없이 DB 평점 높은 순 20편. 평점이 하나도 없으면 KOBIS 목록으로 대체.
export const getAllTimeBestRow = unstable_cache(
  async (): Promise<RowMovie[]> => {
    const rated = await loadRatedMovies();
    if (rated.length > 0) return ratedToRows(rated.slice(0, 20));
    const results = await searchMovieCatalog({}, 20).catch(() => [] as KobisMovieSummary[]);
    return fillWithUnrated(results, new Set(), 10);
  },
  ["all-time-best-row-v2"],
  { revalidate: 60 * 60 * 6, tags: ["movie-rows"] },
);

// ── 장르 탭 전용 행 ─────────────────────────────────────────────────────────
// 올해의 Best(10편)·역대 Best(20편)·사용자 인기영화(15편)를 그 장르 영화로만 만든다.
// 평점이 부족하면 그 장르의 저장된 영화로 칸을 채운다.

export const getGenreYearlyBestRow = unstable_cache(
  async (genreLabel: string): Promise<RowMovie[]> => {
    const keywords = GENRE_KEYWORDS[genreLabel];
    if (!keywords) return [];
    const year = new Date().getFullYear();
    return getRatingSortedMovies(`${year}-01-01`, isoDate(new Date()), 10, keywords);
  },
  ["genre-yearly-best-row"],
  { revalidate: 60 * 60 * 6, tags: ["movie-rows"] },
);

export const getGenreAllTimeBestRow = unstable_cache(
  async (genreLabel: string): Promise<RowMovie[]> => {
    const keywords = GENRE_KEYWORDS[genreLabel];
    if (!keywords) return [];
    const rated = (await loadRatedMovies()).filter((r) => matchesGenre(r.meta.genreAlt, keywords));
    const rows = await ratedToRows(rated.slice(0, 20));
    if (rows.length >= 20) return rows;
    const exclude = new Set(rated.map((r) => r.cd));
    return [...rows, ...(await fillFromCachedGenre(keywords, null, exclude, 20 - rows.length))];
  },
  ["genre-all-time-best-row"],
  { revalidate: 60 * 60 * 6, tags: ["movie-rows"] },
);

export const getGenrePopularRow = unstable_cache(
  async (genreLabel: string): Promise<RowMovie[]> => {
    const keywords = GENRE_KEYWORDS[genreLabel];
    if (!keywords) return [];
    const popular = await _getUserPopularMoviesRow(genreLabel, 15);
    if (popular.length >= 15) return popular;
    const exclude = new Set(popular.map((r) => r.id.replace(/^kobis-/, "")));
    return [...popular, ...(await fillFromCachedGenre(keywords, null, exclude, 15 - popular.length))];
  },
  ["genre-popular-row"],
  { revalidate: 60 * 15, tags: ["movie-rows"] },
);

// 해외 Best: 외국 영화(repNationCd=F) 중 최신순 10편.
export const getInternationalBestRow = unstable_cache(
  async (): Promise<RowMovie[]> => {
    const results = await searchMovieCatalog({ repNationCd: "F" }, 10);
    const rows = await toRowMovies(results);
    if (rows.length > 0) return rows;
    return results.slice(0, 10).map((s) => summaryToRowMovie(s, null));
  },
  ["international-best-row"],
  { revalidate: 60 * 60 * 24, tags: ["movie-rows"] },
);

// KOBIS movieList의 genreAlt(콤마 구분 장르명)에 매칭할 키워드.
// KOBIS 장르명이 우리 탭 라벨과 표기가 달라(로맨스→멜로/로맨스, 모험→어드벤처, 공포→공포(호러))
// 후보 키워드 여러 개를 매칭한다.
export const GENRE_KEYWORDS: Record<string, string[]> = {
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
  뮤지컬: ["뮤지컬", "음악"],
};

// 장르 탭 행. 예전엔 KOBIS 최근 3년 개봉작 150편만 장르로 걸러 외부 API로 포스터를
// 받아왔는데, 편수가 적은 장르(공포 등)는 거의 걸리지 않았고 매번 외부 조회를 기다리다
// 실패하면 행 자체가 사라졌다. 이제 이미 캐시된 영화(포스터·장르가 있는 CachedMovie)를
// 최신 개봉순으로 먼저 채우고, 모자랄 때만 KOBIS 카탈로그로 보충한다(외부 조회 없음).
const genreRowSelect = { movieCd: true, title: true, posterUrl: true, releaseDate: true, genreAlt: true } as const;

async function _getGenreRow(
  genreLabel: string,
  offset = 0,
  pageSize = 20
): Promise<RowMovie[]> {
  const keywords = GENRE_KEYWORDS[genreLabel];
  if (!keywords) return [];
  const want = offset + pageSize;
  const today = isoDate(new Date());

  const cached = await db.cachedMovie.findMany({
    where: {
      posterUrl: { not: null },
      NOT: { movieCd: { startsWith: "wikidata-" } }, // 수상작 전용 사본 — KOBIS 영화와 중복된다
      AND: [
        { OR: keywords.map((kw) => ({ genreAlt: { contains: kw } })) },
        NOT_ADULT_GENRE_WHERE,
        { OR: [{ releaseDate: null }, { releaseDate: { lte: today } }] },
      ],
    },
    orderBy: { releaseDate: { sort: "desc", nulls: "last" } },
    take: want,
    select: genreRowSelect,
  });
  const rows: RowMovie[] = cached.map((m) => ({
    id: /^\d+$/.test(m.movieCd) ? `kobis-${m.movieCd}` : m.movieCd,
    title: m.title,
    posterUrl: formatPosterUrl(m.posterUrl),
    gradient: FALLBACK_GRADIENT,
    isNowShowing: isRecentlyOpened(m.releaseDate),
    releaseDate: m.releaseDate,
    ...genreFields(m.genreAlt),
  }));

  if (rows.length < want) {
    const seen = new Set(cached.map((m) => m.movieCd));
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    const candidates = await fetchOpenedBetween(isoDate(threeYearsAgo), today, 150).catch(() => [] as KobisMovieSummary[]);
    const extra = candidates
      .filter((m) => !seen.has(m.movieCd) && keywords.some((kw) => m.genreAlt?.includes(kw)))
      .slice(0, want - rows.length);
    const metas = await getCachedMovieMetas(extra.map((m) => m.movieCd));
    rows.push(...extra
      .filter((m) => !isAdultGenre(metas.get(m.movieCd)?.genreAlt))
      .map((m) => summaryToRowMovie(m, metas.get(m.movieCd) ?? null)));
  }

  const page = rows.slice(offset, offset + pageSize);
  const avgMap = await getBulkMovieRatingAverages(page.map((r) => r.id.replace(/^kobis-/, "")));
  return page.map((r) => {
    const avgs = avgMap.get(r.id.replace(/^kobis-/, ""));
    return { ...r, shortAvg: avgs?.shortAvg ?? null, shortCount: avgs?.shortCount ?? null, longAvg: avgs?.longAvg ?? null };
  });
}
export const getGenreRow = unstable_cache(
  _getGenreRow,
  ["genre-row-v3"],
  { revalidate: 60 * 60, tags: ["movie-rows"] },
);

// 사용자 인기영화: 이 사이트에서 평점을 가장 많이 받은 영화 순서로 최대 limit편을 반환한다.
// genreFilter가 있으면 그 장르에 속하는 영화만 남긴다 — 각 장르 섹션에서 "이 장르 내 인기"를
// 보여줄 때 쓴다. 평점 데이터가 충분하지 않으면 빈 배열을 돌려줘서 행 자체를 숨긴다.
async function _getUserPopularMoviesRow(
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

  // 장르 탭에선 후보가 200편이라 getMovieMetas를 쓰면 만료된 영화마다 외부 API 재조회가
  // 줄을 선다. 평점이 달린 영화는 이미 DB에 캐시돼 있으니 DB만 읽는다.
  const [metas, avgMap] = await Promise.all([
    getCachedMovieMetas(movieCds),
    getBulkMovieRatingAverages(movieCds),
  ]);

  const rows: RowMovie[] = [];
  for (const cd of movieCds) {
    const meta = metas.get(cd) ?? null;
    if (!meta?.posterUrl) continue;
    if (isAdultGenre(meta.genreAlt)) continue;

    // 장르 필터: genreFilter가 있으면 GENRE_KEYWORDS 기준으로 걸러낸다
    if (genreFilter) {
      const keywords = GENRE_KEYWORDS[genreFilter] ?? [];
      const hasGenre = keywords.some((kw) => meta.genreAlt?.includes(kw));
      if (!hasGenre) continue;
    }

    const avgs = avgMap.get(cd);
    rows.push({
      id: `kobis-${cd}`,
      title: metas.get(cd)?.movieTitle ?? cd,
      posterUrl: meta.posterUrl,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: false,
      ...genreFields(meta.genreAlt),
      shortAvg: avgs?.shortAvg ?? null,
      shortCount: avgs?.shortCount ?? null,
      longAvg: avgs?.longAvg ?? null,
    });

    if (rows.length >= limit) break;
  }

  return rows;
}
export const getUserPopularMoviesRow = unstable_cache(
  _getUserPopularMoviesRow,
  ["user-popular-movies-row"],
  { revalidate: 60 * 15, tags: ["movie-rows"] },
);
