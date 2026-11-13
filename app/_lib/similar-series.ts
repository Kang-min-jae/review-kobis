// 시리즈 상세 페이지 오른쪽 "비슷한 시리즈" 카드 20개(10개씩 두 줄). 시리즈로만 채운다.
//
// 후보는 아래 순서로 모은다(최대 POOL개, 시리즈마다 1시간 캐시 — 페이지를 볼 때마다 DB·TMDB를 다시 부르지 않게).
//   ① MovieSimilarity — 회원 평점 기반 유사도 중 시리즈인 것
//   ② TMDB /tv/{id}/recommendations → /tv/{id}/similar
//   ③ 같은 장르의 시리즈(CachedSeries)
//   ④ 회원 평점이 많이 달린 시리즈
// 그다음 요청마다: 지금 시리즈, 내가 평점·리뷰를 남긴 시리즈를 빼고 20개, 평균 별점은 최신 값으로 붙인다.
// 포스터가 없는 작품과 성인물은 뺀다. 누가 무엇을 좋아했는지는 내보내지 않는다(카드엔 작품 정보만).

import { unstable_cache } from "next/cache";
import { db } from "./db";
import { getTmdbSeriesRecommendations } from "./tmdb";
import { genreFields, splitGenres, type RowMovie } from "./movie-rows";
import { isAdultContent } from "./adult-content";
import { canonicalGenres, genreQueryKeywords } from "./genre-canon";
import { formatPosterUrl } from "./formatPosterUrl";
import { getExcludedMovieCds } from "./similar-movies";
import { withFreshRatings } from "./fresh-ratings";
import { isSeriesCd } from "./rating-input";

export const SIMILAR_SERIES_TITLE = "비슷한 시리즈";
export const SIMILAR_SERIES_COUNT = 20;
const POOL = 40; // 내가 본 시리즈를 빼고도 20개가 남도록 넉넉히 모은다
const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

type Candidate = { id: string; title: string; posterUrl: string | null; genreAlt: string | null };

const SERIES_SELECT = { tmdbId: true, name: true, posterUrl: true, genreAlt: true } as const;

function toCandidate(s: { tmdbId: string; name: string; posterUrl: string | null; genreAlt: string | null }): Candidate {
  return { id: `tmdb-tv-${s.tmdbId}`, title: s.name, posterUrl: s.posterUrl, genreAlt: s.genreAlt };
}

// "tmdb-tv-123" 목록을 순서를 지키며 CachedSeries 행으로 바꾼다(DB에 없으면 빠진다).
async function seriesRows(seriesIds: string[]): Promise<Candidate[]> {
  const tmdbIds = seriesIds.filter((id) => isSeriesCd(id)).map((id) => id.slice("tmdb-tv-".length));
  if (tmdbIds.length === 0) return [];
  const rows = await db.cachedSeries.findMany({ where: { tmdbId: { in: tmdbIds } }, select: SERIES_SELECT });
  const byId = new Map(rows.map((r) => [r.tmdbId, r]));
  return tmdbIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r)).map(toCandidate);
}

async function loadCandidates(seriesId: string, tmdbId: string, title: string, genreAlt: string | null): Promise<Candidate[]> {
  const picked: Candidate[] = [];
  const ids = new Set<string>([seriesId]);
  const titles = new Set<string>([title]);
  const take = (rows: Candidate[]) => {
    for (const r of rows) {
      if (picked.length >= POOL) return;
      if (!r.posterUrl || ids.has(r.id) || titles.has(r.title)) continue;
      if (isAdultContent({ title: r.title, genreAlt: r.genreAlt })) continue;
      ids.add(r.id);
      titles.add(r.title);
      picked.push(r);
    }
  };

  // ① 회원 평점 기반 유사도
  const similar = await db.movieSimilarity
    .findMany({
      where: { movieCd: seriesId, similarMovieCd: { startsWith: "tmdb-tv-" } },
      orderBy: [{ score: "desc" }, { coLikes: "desc" }],
      select: { similarMovieCd: true },
      take: POOL,
    })
    .catch(() => []);
  take(await seriesRows(similar.map((s) => s.similarMovieCd)));

  // ② TMDB 추천·비슷한 작품
  if (picked.length < POOL) {
    const recs = await getTmdbSeriesRecommendations(tmdbId).catch(() => []);
    take(recs.map((s) => ({ id: `tmdb-tv-${s.tmdbId}`, title: s.name, posterUrl: s.posterUrl, genreAlt: s.genre })));
  }

  // ③ 같은 장르의 시리즈
  const keywords = [...new Set(canonicalGenres(splitGenres(genreAlt)).flatMap(genreQueryKeywords))];
  if (picked.length < POOL && keywords.length > 0) {
    const rows = await db.cachedSeries.findMany({
      where: { posterUrl: { not: null }, OR: keywords.map((kw) => ({ genreAlt: { contains: kw } })) },
      orderBy: { updatedAt: "desc" },
      select: SERIES_SELECT,
      take: 60,
    });
    take(rows.map(toCandidate));
  }

  // ④ 회원 평점이 많이 달린 시리즈
  if (picked.length < POOL) {
    const popular = await db.categoryRating.groupBy({
      by: ["movieCd"],
      where: { movieCd: { startsWith: "tmdb-tv-" }, category: "전체" },
      _count: { _all: true },
      orderBy: { _count: { movieCd: "desc" } },
      take: 60,
    });
    take(await seriesRows(popular.map((p) => p.movieCd)));
  }

  return picked;
}

const getCandidates = unstable_cache(loadCandidates, ["similar-series-v1"], { revalidate: 60 * 60 * 24 * 7 });

export async function getSimilarSeries(input: {
  seriesId: string;
  tmdbId: string;
  title: string;
  genreAlt: string | null;
  userId: string | null;
}): Promise<RowMovie[]> {
  const [candidates, excluded] = await Promise.all([
    getCandidates(input.seriesId, input.tmdbId, input.title, input.genreAlt),
    getExcludedMovieCds(input.userId),
  ]);
  const rows: RowMovie[] = candidates
    .filter((c) => !excluded.has(c.id))
    .slice(0, SIMILAR_SERIES_COUNT)
    .map((c) => ({
      id: c.id,
      title: c.title,
      posterUrl: formatPosterUrl(c.posterUrl),
      gradient: FALLBACK_GRADIENT,
      isNowShowing: false,
      ...genreFields(c.genreAlt),
    }));
  return withFreshRatings(rows);
}
