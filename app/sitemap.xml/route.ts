import { connection } from "next/server";
import { SITE_URL, movieDetailPath } from "../_lib/site";
import { db } from "../_lib/db";
import { isAdultContent } from "../_lib/adult-content";
import { cdToMovieId, isSeriesCd } from "../_lib/rating-input";
import { WIKIDATA_VERIFIED } from "../_lib/movie-rate-info";

// /sitemap.xml — 누구나 볼 수 있는 고정 페이지 + 영화·시리즈 상세(평점) 페이지.
// 홈 탭(?category=…)은 정식 주소(canonical)가 홈이라 넣지 않는다. 로그인이 필요한 페이지(/login, /my-list,
// /mypage 등)는 robots.ts에서 막고 여기에도 넣지 않는다.
//
// 영화 상세 주소는 /movies/<id>/rate (site.ts의 movieDetailPath — 상세 페이지 canonical과 같다).
// 영화는 우선순위 순으로 최대 MOVIE_URL_LIMIT편:
//   1) 박스오피스 — 홈 행이 저장해 둔 순위(RankingSnapshot: 현재 상영작·주간 박스오피스)
//   2) 회원 평점·리뷰가 있는 영화 — 최근 활동 순
// "최근 개봉작"(DB에 정보가 있는 영화)은 뺐다 — DB에는 봇이 한 번 연 영화도 저장돼서, 봇이 연 페이지가 사이트맵에
// 실리고 구글이 그 페이지를 또 새로 만들게 하는 순환이 생겼다(새 페이지 하나마다 ISR 쓰기·서버 실행·DB 읽기).
// 성인물, TMDB 연결 검증 전인 수상작 항목(wikidata-*)은 뺀다.
// 시리즈 상세(/series/<id>/rate)는 회원 평점·리뷰가 있는 시리즈만 최근 활동 순으로 최대 SERIES_URL_LIMIT편.
// lastModified = 그 작품의 마지막 평점·리뷰 시각과 작품 정보 갱신 시각 중 가장 늦은 것.
//
// 한 사이트맵 파일은 URL 5만 개가 한도다. 고정 페이지 + MOVIE_URL_LIMIT이 그보다 훨씬 작아 파일 하나로
// 충분하다. 한도를 5만 근처까지 올려야 하면 generateSitemaps로 나누고 robots.ts에 각 파일을 적어야 한다.
//
// DB를 읽으므로 빌드 때가 아니라 요청 때 만든다(빌드 때 DB를 읽지 않게). 외부 API(KOBIS)는 부르지 않는다 —
// 예전엔 만들 때마다 KOBIS 일별 박스오피스 3일치를 불러, 봇이 사이트맵을 열 때마다 하루 이용량을 썼다.
// 응답은 CDN에 하루 캐시한다(Cache-Control) — ISR·데이터 캐시에 쓰지 않아 ISR Write가 생기지 않는다.
// DB 오류가 나면 고정 페이지만 내보내고, 그 응답은 짧게(10분)만 캐시한다.

const SITEMAP_URL_MAX = 50_000;
// 상세 페이지는 요청마다 새로 그리는 무거운 페이지라 검색봇 수집량을 고려해 우선 2,000편까지만 싣는다.
const MOVIE_URL_LIMIT = 2_000;
const SERIES_URL_LIMIT = 500;

const STATIC_PAGES: { path: string; changeFrequency: "daily" | "weekly" | "monthly"; priority: number }[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/awards", changeFrequency: "weekly", priority: 0.7 },
  { path: "/theaters", changeFrequency: "weekly", priority: 0.4 },
  { path: "/help", changeFrequency: "monthly", priority: 0.3 },
  { path: "/help/notices", changeFrequency: "weekly", priority: 0.3 },
  { path: "/legal", changeFrequency: "monthly", priority: 0.2 },
];

type MovieEntry = { movieId: string; lastModified: string; boxOffice: boolean }; // lastModified: ISO

// 홈의 "현재 상영중"·"이번주 박스오피스" 행이 KOBIS에서 받아 DB에 저장해 둔 가장 최근 순위.
async function loadBoxOfficeCds(): Promise<string[]> {
  const rows = await db.rankingSnapshot.findMany({
    where: { listType: { in: ["now_showing", "weekly_box_office"] } },
    orderBy: [{ syncedAt: "desc" }, { rank: "asc" }],
    select: { movieCd: true },
    take: 60,
  });
  const cds: string[] = [];
  for (const { movieCd } of rows) if (movieCd && !cds.includes(movieCd)) cds.push(movieCd);
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

  const [boxOfficeCds, activity] = await Promise.all([loadBoxOfficeCds().catch(() => []), loadActivity(notSeries, limit)]);
  const activeCds = [...activity.keys()].sort((a, b) => activity.get(b)! - activity.get(a)!);


  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const cd of [...boxOfficeCds, ...activeCds]) {
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

type SitemapUrl = { url: string; lastModified: string; changeFrequency: "daily" | "weekly" | "monthly"; priority: number };

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

function toXml(urls: SitemapUrl[]): string {
  const body = urls
    .map(
      (u) =>
        `<url>\n<loc>${escapeXml(u.url)}</loc>\n<lastmod>${u.lastModified}</lastmod>\n<changefreq>${u.changeFrequency}</changefreq>\n<priority>${u.priority}</priority>\n</url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

const DAY = 60 * 60 * 24;

export async function GET() {
  await connection();
  const now = new Date().toISOString();
  const pages: SitemapUrl[] = STATIC_PAGES.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  let movies: MovieEntry[] = [];
  let ok = true;
  try {
    movies = await loadSitemapEntries();
  } catch (error) {
    ok = false;
    console.warn("[sitemap] 영화·시리즈 목록을 불러오지 못해 고정 페이지만 내보냅니다:", error);
  }

  const urls: SitemapUrl[] = [
    ...pages,
    ...movies.map((m) => ({
      url: `${SITE_URL}${movieDetailPath(m.movieId)}`,
      lastModified: m.lastModified,
      changeFrequency: m.boxOffice ? ("daily" as const) : ("weekly" as const),
      priority: m.boxOffice ? 0.8 : 0.6,
    })),
  ].slice(0, SITEMAP_URL_MAX);

  return new Response(toXml(urls), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // CDN이 하루 동안 이 응답을 그대로 내준다(만료 뒤에도 새로 만드는 동안 이전 것을 내준다).
      "Cache-Control": ok ? `public, s-maxage=${DAY}, stale-while-revalidate=${DAY}` : "public, s-maxage=600",
    },
  });
}
