import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { unstable_cache } from "next/cache";
import { SITE_URL, movieDetailPath } from "./_lib/site";
import { db } from "./_lib/db";
import { getDailyBoxOfficeList } from "./_lib/kobis";
import { isAdultContent } from "./_lib/adult-content";
import { cdToMovieId, isSeriesCd } from "./_lib/rating-input";
import { WIKIDATA_VERIFIED } from "./_lib/movie-rate-info";

// /sitemap.xml — 누구나 볼 수 있는 고정 페이지 + 영화·시리즈 상세(평점) 페이지.
// 홈 탭(?category=…)은 정식 주소(canonical)가 홈이라 넣지 않는다. 로그인이 필요한 페이지(/login, /my-list,
// /mypage 등)는 robots.ts에서 막고 여기에도 넣지 않는다.
//
// 영화 상세 주소는 /movies/<id>/rate (site.ts의 movieDetailPath — 상세 페이지 canonical과 같다).
// 영화는 우선순위 순으로 최대 MOVIE_URL_LIMIT편:
//   1) 박스오피스(최근 3일 일별 TOP10) — 현재 상영작
//   2) 회원 평점·리뷰가 있는 영화 — 최근 활동 순
//   3) 최근 개봉작(지난 RECENT_RELEASE_DAYS일 안 개봉, DB에 정보가 있는 영화)
// 성인물, TMDB 연결 검증 전인 수상작 항목(wikidata-*)은 뺀다.
// 시리즈 상세(/series/<id>/rate)는 회원 평점·리뷰가 있는 시리즈만 최근 활동 순으로 최대 SERIES_URL_LIMIT편.
// lastModified = 그 작품의 마지막 평점·리뷰 시각과 작품 정보 갱신 시각 중 가장 늦은 것.
//
// 한 사이트맵 파일은 URL 5만 개가 한도다. 고정 페이지 + MOVIE_URL_LIMIT이 그보다 훨씬 작아 파일 하나로
// 충분하다. 한도를 5만 근처까지 올려야 하면 generateSitemaps로 나누고 robots.ts에 각 파일을 적어야 한다.
//
// DB를 읽으므로 빌드 때가 아니라 요청 때 만든다(빌드 환경에서 DB에 못 붙어도 빌드가 깨지지 않게).
// 영화 목록은 1시간 캐시하고, DB 오류가 나면 고정 페이지만 내보낸다.

const SITEMAP_URL_MAX = 50_000;
// 상세 페이지는 요청마다 새로 그리는 무거운 페이지라 검색봇 수집량을 고려해 우선 2,000편까지만 싣는다.
const MOVIE_URL_LIMIT = 2_000;
const SERIES_URL_LIMIT = 500;
const RECENT_RELEASE_DAYS = 90;

const STATIC_PAGES: { path: string; changeFrequency: "daily" | "weekly" | "monthly"; priority: number }[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/awards", changeFrequency: "weekly", priority: 0.7 },
  { path: "/theaters", changeFrequency: "weekly", priority: 0.4 },
  { path: "/help", changeFrequency: "monthly", priority: 0.3 },
  { path: "/help/notices", changeFrequency: "weekly", priority: 0.3 },
  { path: "/legal", changeFrequency: "monthly", priority: 0.2 },
];

type MovieEntry = { movieId: string; lastModified: string; boxOffice: boolean }; // lastModified: ISO

async function loadBoxOfficeCds(): Promise<string[]> {
  const days = await Promise.all([1, 2, 3].map((d) => getDailyBoxOfficeList(d).catch(() => [])));
  const cds: string[] = [];
  for (const entry of days.flat()) if (entry.movieCd && !cds.includes(entry.movieCd)) cds.push(entry.movieCd);
  return cds;
}

// 작품별 마지막 평점·리뷰 시각 — where로 영화/시리즈를 고른다.
async function loadActivity(where: object, take: number): Promise<Map<string, number>> {
  const [ratingActivity, reviewActivity] = await Promise.all([
    db.categoryRating.groupBy({
      by: ["movieCd"],
      where,
      _max: { updatedAt: true },
      orderBy: { _max: { updatedAt: "desc" } },
      take,
    }),
    db.review.groupBy({
      by: ["movieCd"],
      where,
      _max: { updatedAt: true },
      orderBy: { _max: { updatedAt: "desc" } },
      take,
    }),
  ]);
  const activity = new Map<string, number>();
  for (const row of [...ratingActivity, ...reviewActivity]) {
    const t = row._max.updatedAt?.getTime() ?? 0;
    if (t > (activity.get(row.movieCd) ?? 0)) activity.set(row.movieCd, t);
  }
  return activity;
}

async function loadSitemapMovies(): Promise<MovieEntry[]> {
  const limit = Math.min(MOVIE_URL_LIMIT, SITEMAP_URL_MAX - STATIC_PAGES.length);
  const notSeries = { NOT: { movieCd: { startsWith: "tmdb-tv-" } } };

  const [boxOfficeCds, activity] = await Promise.all([loadBoxOfficeCds(), loadActivity(notSeries, limit)]);
  const activeCds = [...activity.keys()].sort((a, b) => activity.get(b)! - activity.get(a)!);

  const sinceIso = new Date(Date.now() - RECENT_RELEASE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);
  const recentReleases = await db.cachedMovie.findMany({
    where: { releaseDate: { gte: sinceIso, lte: todayIso }, ...notSeries },
    orderBy: { releaseDate: "desc" },
    select: { movieCd: true },
    take: limit,
  });

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const cd of [...boxOfficeCds, ...activeCds, ...recentReleases.map((m) => m.movieCd)]) {
    if (seen.has(cd) || isSeriesCd(cd)) continue;
    seen.add(cd);
    ordered.push(cd);
  }

  // 상세 페이지를 바로 그릴 수 있는(DB에 정보가 있는) 영화만 넣는다.
  const infos = await db.cachedMovie.findMany({
    where: { movieCd: { in: ordered.slice(0, limit * 2) } },
    select: { movieCd: true, title: true, genreAlt: true, source: true, updatedAt: true },
  });
  const infoByCd = new Map(infos.map((m) => [m.movieCd, m]));
  const boxOfficeSet = new Set(boxOfficeCds);

  const result: MovieEntry[] = [];
  for (const cd of ordered) {
    if (result.length >= limit) break;
    const info = infoByCd.get(cd);
    if (!info || isAdultContent(info)) continue;
    if (cd.startsWith("wikidata-") && info.source !== WIKIDATA_VERIFIED) continue;
    const last = Math.max(activity.get(cd) ?? 0, info.updatedAt.getTime());
    result.push({ movieId: cdToMovieId(cd), lastModified: new Date(last).toISOString(), boxOffice: boxOfficeSet.has(cd) });
  }
  return result;
}

// 회원 평점·리뷰가 있는 시리즈 — 상세 페이지를 바로 그릴 수 있는(CachedSeries에 정보가 있는) 것만.
async function loadSitemapSeries(): Promise<MovieEntry[]> {
  const activity = await loadActivity({ movieCd: { startsWith: "tmdb-tv-" } }, SERIES_URL_LIMIT);
  const ids = [...activity.keys()];
  const infos = await db.cachedSeries.findMany({
    where: { tmdbId: { in: ids.map((cd) => cd.slice("tmdb-tv-".length)) } },
    select: { tmdbId: true, name: true, genreAlt: true, updatedAt: true },
  });
  const infoById = new Map(infos.map((s) => [`tmdb-tv-${s.tmdbId}`, s]));

  const result: MovieEntry[] = [];
  for (const cd of ids.sort((a, b) => activity.get(b)! - activity.get(a)!)) {
    const info = infoById.get(cd);
    if (!info || isAdultContent({ title: info.name, genreAlt: info.genreAlt })) continue;
    const last = Math.max(activity.get(cd) ?? 0, info.updatedAt.getTime());
    result.push({ movieId: cd, lastModified: new Date(last).toISOString(), boxOffice: false });
  }
  return result;
}

async function loadSitemapEntries(): Promise<MovieEntry[]> {
  const [movies, series] = await Promise.all([loadSitemapMovies(), loadSitemapSeries().catch(() => [])]);
  return [...movies, ...series];
}

const getSitemapEntries = unstable_cache(loadSitemapEntries, ["sitemap-entries-v2"], { revalidate: 3600 });

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const now = new Date();
  const pages: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  let movies: MovieEntry[] = [];
  try {
    movies = await getSitemapEntries();
  } catch (error) {
    console.warn("[sitemap] 영화·시리즈 목록을 불러오지 못해 고정 페이지만 내보냅니다:", error);
  }

  return [
    ...pages,
    ...movies.map((m) => ({
      url: `${SITE_URL}${movieDetailPath(m.movieId)}`,
      lastModified: new Date(m.lastModified),
      changeFrequency: m.boxOffice ? ("daily" as const) : ("weekly" as const),
      priority: m.boxOffice ? 0.8 : 0.6,
    })),
  ].slice(0, SITEMAP_URL_MAX);
}
