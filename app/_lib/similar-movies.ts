// 영화 상세 페이지 오른쪽 "이 영화를 좋아한 사람들이 본" / "비슷한 영화" 카드 3개.
//
// 1순위: MovieSimilarity(회원 평점 기반 코사인 유사도, movie-similarity-compute.ts가 매일 계산).
//        이걸로 3개가 채워질 때만 제목을 "이 영화를 좋아한 사람들이 본"으로 쓴다.
// 모자라면 아래 순서로 채우고 제목을 "비슷한 영화"로 바꾼다.
//   ① TMDB /movie/{id}/recommendations 중 우리 DB(CachedMovie)에 있는 영화
//   ② 같은 감독 또는 같은 주연 배우의 영화
//   ③ 같은 장르 중 회원 평균 평점이 높은 영화
// 공통 제외: 지금 영화, 내가 평점·리뷰를 남겼거나 "봤어요"를 누른 영화, DB에 없는(삭제된) 영화, 성인물.
// 누가 무엇을 좋아했는지는 어디에도 내보내지 않는다(카드에는 영화 정보만 담는다).

import { db } from "./db";
import { cdToMovieId } from "./rating-input";
import { formatPosterUrl } from "./formatPosterUrl";
import { genreFields, splitGenres, type RowMovie } from "./movie-rows";
import { getBulkMovieRatingAverages } from "./review-data";
import { getTmdbMovieRecommendationIds } from "./tmdb";
import { isAdultContent, NOT_ADULT_GENRE_WHERE } from "./adult-content";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";
export const SIMILAR_MOVIE_COUNT = 3;
// ③ 장르 폴백은 회원 평균(0~10)이 이 이상인 영화만 — "평균이 높은" 영화만 채운다.
const GENRE_FALLBACK_MIN_AVG = 7;

export const CF_SECTION_TITLE = "이 영화를 좋아한 사람들이 본";
export const FALLBACK_SECTION_TITLE = "비슷한 영화";

type CachedRow = { movieCd: string; title: string; posterUrl: string | null; genreAlt: string | null };
const ROW_SELECT = { movieCd: true, title: true, posterUrl: true, genreAlt: true } as const;

async function getExcludedMovieCds(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const [ratings, reviews, watched] = await Promise.all([
    db.categoryRating.findMany({ where: { userId }, select: { movieCd: true }, distinct: ["movieCd"] }),
    db.review.findMany({ where: { userId }, select: { movieCd: true }, distinct: ["movieCd"] }),
    db.watchTrigger.findMany({ where: { readerId: userId }, select: { review: { select: { movieCd: true } } } }),
  ]);
  return new Set([...ratings.map((r) => r.movieCd), ...reviews.map((r) => r.movieCd), ...watched.map((w) => w.review.movieCd)]);
}

// 후보 movieCd 목록을 순서를 지키며 CachedMovie 행으로 바꾼다(DB에 없거나 성인물이면 빠진다).
async function loadRows(movieCds: string[]): Promise<CachedRow[]> {
  if (movieCds.length === 0) return [];
  const rows = await db.cachedMovie.findMany({ where: { movieCd: { in: movieCds }, ...NOT_ADULT_GENRE_WHERE }, select: ROW_SELECT });
  const byCd = new Map(rows.map((r) => [r.movieCd, r]));
  return movieCds.map((cd) => byCd.get(cd)).filter((r): r is CachedRow => Boolean(r));
}

async function fromTmdbRecommendations(tmdbId: string | null): Promise<CachedRow[]> {
  if (!tmdbId) return [];
  const ids = (await getTmdbMovieRecommendationIds(tmdbId).catch(() => [])).slice(0, 20);
  if (ids.length === 0) return [];
  const rows = await db.cachedMovie.findMany({
    where: { AND: [{ OR: [{ tmdbId: { in: ids } }, { movieCd: { in: ids.map((id) => `tmdb-${id}`) } }] }, NOT_ADULT_GENRE_WHERE] },
    select: { ...ROW_SELECT, tmdbId: true },
  });
  const rank = (r: { movieCd: string; tmdbId: string | null }) => {
    const id = r.tmdbId ?? (r.movieCd.startsWith("tmdb-") ? r.movieCd.slice("tmdb-".length) : "");
    const i = ids.indexOf(id);
    return i === -1 ? ids.length : i;
  };
  return rows.sort((a, b) => rank(a) - rank(b));
}

async function fromSamePeople(directorName: string | null, leadActorName: string | null): Promise<CachedRow[]> {
  const or: object[] = [];
  if (directorName) or.push({ directorName });
  if (leadActorName) or.push({ cast: { array_contains: [{ name: leadActorName }] } });
  if (or.length === 0) return [];
  return db.cachedMovie.findMany({
    where: { AND: [{ OR: or }, NOT_ADULT_GENRE_WHERE] },
    select: ROW_SELECT,
    orderBy: { releaseDate: { sort: "desc", nulls: "last" } },
    take: 30,
  });
}

async function fromSameGenreTopRated(genreAlt: string | null): Promise<CachedRow[]> {
  const genre = splitGenres(genreAlt)[0];
  if (!genre) return [];
  const rows = await db.cachedMovie.findMany({
    where: { AND: [{ genreAlt: { contains: genre } }, NOT_ADULT_GENRE_WHERE] },
    select: ROW_SELECT,
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const avgs = await getBulkMovieRatingAverages(rows.map((r) => r.movieCd));
  return rows
    .filter((r) => (avgs.get(r.movieCd)?.shortAvg ?? 0) >= GENRE_FALLBACK_MIN_AVG)
    .sort((a, b) => (avgs.get(b.movieCd)?.shortAvg ?? 0) - (avgs.get(a.movieCd)?.shortAvg ?? 0));
}

async function toRowMovies(rows: CachedRow[]): Promise<RowMovie[]> {
  const avgs = await getBulkMovieRatingAverages(rows.map((r) => r.movieCd));
  return rows.map((r) => {
    const a = avgs.get(r.movieCd);
    return {
      id: cdToMovieId(r.movieCd),
      title: r.title,
      posterUrl: formatPosterUrl(r.posterUrl),
      gradient: FALLBACK_GRADIENT,
      isNowShowing: false,
      ...genreFields(r.genreAlt),
      shortAvg: a?.shortAvg ?? null,
      shortCount: a?.shortCount ?? null,
      longAvg: a?.longAvg ?? null,
    };
  });
}

export async function getSimilarMovies(input: {
  movieCd: string;
  movieTitle: string;
  tmdbId: string | null;
  directorName: string | null;
  leadActorName: string | null;
  genreAlt: string | null;
  userId: string | null;
}): Promise<{ title: string; movies: RowMovie[] }> {
  const excluded = await getExcludedMovieCds(input.userId);
  excluded.add(input.movieCd);

  const picked: CachedRow[] = [];
  const pickedCds = new Set<string>();
  const take = (rows: CachedRow[]) => {
    for (const r of rows) {
      if (picked.length >= SIMILAR_MOVIE_COUNT) return;
      if (excluded.has(r.movieCd) || pickedCds.has(r.movieCd) || r.title === input.movieTitle || isAdultContent(r)) continue;
      // KOBIS 영화와 같은 작품의 tmdb-* 행이 둘 다 있을 수 있어 제목으로도 한 번 더 거른다.
      if (picked.some((p) => p.title === r.title)) continue;
      picked.push(r);
      pickedCds.add(r.movieCd);
    }
  };

  const similar = await db.movieSimilarity
    .findMany({
      where: { movieCd: input.movieCd },
      orderBy: [{ score: "desc" }, { coLikes: "desc" }],
      select: { similarMovieCd: true },
      take: 20,
    })
    .catch(() => []);
  take(await loadRows(similar.map((s) => s.similarMovieCd)));

  if (picked.length >= SIMILAR_MOVIE_COUNT) {
    return { title: CF_SECTION_TITLE, movies: await toRowMovies(picked) };
  }

  const fallbacks = [
    () => fromTmdbRecommendations(input.tmdbId),
    () => fromSamePeople(input.directorName, input.leadActorName),
    () => fromSameGenreTopRated(input.genreAlt),
  ];
  for (const next of fallbacks) {
    if (picked.length >= SIMILAR_MOVIE_COUNT) break;
    take(await next().catch(() => []));
  }
  return { title: FALLBACK_SECTION_TITLE, movies: await toRowMovies(picked) };
}
