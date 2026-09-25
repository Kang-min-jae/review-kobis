import { NextResponse, after } from "next/server";
import { db } from "../../_lib/db";
import { getBulkMovieRatingAverages } from "../../_lib/review-data";
import { getCachedMovieMetas, WIKIDATA_VERIFIED } from "../../_lib/movie-rate-info";
import { genreFields, splitGenres, GENRE_KEYWORDS } from "../../_lib/movie-rows";
import type { RowMovie } from "../../_lib/movie-rows";
import {
  buildAffinityContext,
  computeBayesianQuality,
  calculateMovieAffinity,
  type AffinityContext,
  type RatedMovieForContext,
} from "../../_lib/calculateAffinity";

const FALLBACK_GRADIENT_VAL = "from-neutral-800 via-neutral-600 to-neutral-400";

// 수상작 항목(wikidata-*) 중 TMDB 연결 검증 전인 것은 다른 영화의 포스터·장르가 붙어
// 있을 수 있어 추천 후보에서 뺀다(평점 페이지 조회 시 검증되면 다시 포함된다).
const EXCLUDE_UNVERIFIED_AWARD = {
  NOT: { movieCd: { startsWith: "wikidata-" }, source: { not: WIKIDATA_VERIFIED } },
};

// 동일 입력(평점 데이터)에 대한 반복 요청을 2분간 캐싱 — React StrictMode 이중 호출,
// 빠른 페이지 재진입 등으로 발생하는 중복 요청을 서버에서 흡수한다.
const recServerCache = new Map<string, { data: { results: RowMovie[] }; expiresAt: number }>();
const REC_CACHE_TTL = 2 * 60 * 1000; // 2분
const REC_CACHE_MAX = 200;

// LLM 리랭킹은 보통 수 초가 걸려 요청 안에서 기다리면(예전엔 400ms 상한) 응답만
// 늦어지고 결과는 거의 매번 버려졌다. 응답을 먼저 보내고 after()에서 LLM을 돌려
// 결과를 캐시해 두면, 같은 입력의 다음 요청부터 LLM 순위·추천 이유가 반영된다.
const llmCache = new Map<string, { results: LlmResult; expiresAt: number }>();
const LLM_CACHE_TTL = 30 * 60 * 1000;

function hashBody(ratings: { movieId: string; rating: number }[], catRatings: { movieId: string; category: string; value: number }[]): string {
  const rStr = ratings.map((r) => `${r.movieId}:${r.rating}`).sort().join(",");
  const cStr = catRatings.map((r) => `${r.movieId}:${r.category}:${r.value}`).sort().join(",");
  let h = 0;
  for (const ch of rStr + "|" + cStr) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return String(h >>> 0);
}

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

type IncomingRating = {
  movieId: string;
  rating: number;  // 0-10 normalized
  ratedAt: string; // ISO
};

type IncomingCategoryRating = {
  movieId: string;
  category: string;
  value: number; // 0-10
};

type RequestBody = {
  myRatings: IncomingRating[];
  myCategoryRatings: IncomingCategoryRating[];
  // 장르 탭의 추천 행 — 이 장르 영화 안에서만 추천한다.
  genre?: string;
  limit?: number;
};

type UserProfile = {
  // 채널 검색용 리스트 (기존 유지)
  topGenres: string[];
  topDirectors: string[];
  topActors: string[];
  avoidedGenres: string[];
  avoidedDirectors: string[];
  // 항목별 선호 비중(합계 1). 자주 평가하는 항목일수록, 내 평균보다 높게 주는 항목일수록 크다.
  categoryWeights: Record<string, number>;
  coldStart: boolean;
  // 코사인 유사도용 가중치 벡터 (긍정/부정 분리)
  genreVec: Record<string, number>;
  directorVec: Record<string, number>;
  actorVec: Record<string, number>;
  avoidedGenreVec: Record<string, number>;
  avoidedDirectorVec: Record<string, number>;
};

type DbMovie = {
  movieCd: string;
  tmdbId: string | null;
  title: string;
  posterUrl: string | null;
  genreAlt: string | null;
  directorName: string | null;
  cast: unknown;
};

type CandidateMovie = {
  movieCd: string;
  tmdbId: string | null;
  title: string;
  posterUrl: string | null;
  genreAlt: string | null;
  directorName: string | null;
  cast: { name: string }[];
  allGenres: string[];
  totalScore: number;
  // 사이트 리뷰 집계 (Bayesian 품질 점수 + 항목별 친화도용)
  reviewAvg: number | null;
  reviewCount: number;
  // 다른 사용자들이 남긴 항목별 평점 집계 (연출·연기·각본·음악·편집)
  categoryStats: Record<string, { avg: number; count: number }>;
};

type LlmResult = { movieCd: string; score: number; reason: string }[];

// ─────────────────────────────────────────────────────
// 1. Temporal weighting
// ─────────────────────────────────────────────────────

// 최근 평가일수록, 높은/낮은 평점일수록 강하게 반영.
// 평가 개수가 적을수록 반감기를 길게 — 프로필이 급격히 흔들리지 않게.
function getTemporalWeight(rating: number, ratedAt: string, totalCount: number): number {
  const daysDiff = (Date.now() - new Date(ratedAt).getTime()) / 86400000;
  const halfLifeDays = totalCount < 10 ? 180 : totalCount < 30 ? 120 : 90;
  const timeWeight = Math.pow(0.5, daysDiff / halfLifeDays);
  return (rating - 5) * timeWeight; // -5~+5 범위
}

// ─────────────────────────────────────────────────────
// 1-b. 항목별 선호 비중
// ─────────────────────────────────────────────────────

const CATEGORY_KEYS = ["연출", "연기", "각본", "음악", "편집"];

// 사용자가 어떤 항목을 중시하는지 — 두 신호를 곱해 비중(합계 1)으로 만든다.
//  · 빈도: 그 항목에 평점을 얼마나 자주 남겼나 (연출에 유독 많이 남김 → 연출 비중↑)
//  · 상대 점수: 그 항목에 준 평균이 내 항목 평균보다 얼마나 높은가
//    (음악을 다른 항목보다 높게 줌 → 음악 비중↑, 1점 높을 때마다 ×1.2, 0.5~1.5배로 제한)
// "전체" 평점을 높게(7점 이상) 준 영화에서 남긴 항목 점수는 취향을 더 잘 드러내므로
// 그렇지 않은 영화의 항목 점수보다 2배로 반영한다.
function buildCategoryWeights(
  ratings: IncomingRating[],
  categoryRatings: IncomingCategoryRating[],
): Record<string, number> {
  const overallByMovie = new Map(ratings.map((r) => [r.movieId, r.rating]));
  const agg = new Map<string, { weightedSum: number; weight: number }>();
  let totalSum = 0;
  let totalWeight = 0;
  for (const cr of categoryRatings) {
    if (!CATEGORY_KEYS.includes(cr.category)) continue;
    const overall = overallByMovie.get(cr.movieId);
    const w = overall === undefined || overall >= 7 ? 1 : 0.5;
    const entry = agg.get(cr.category) ?? { weightedSum: 0, weight: 0 };
    entry.weightedSum += cr.value * w;
    entry.weight += w;
    agg.set(cr.category, entry);
    totalSum += cr.value * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return {};

  const userMean = totalSum / totalWeight;
  const raw: Record<string, number> = {};
  let rawSum = 0;
  for (const [cat, { weightedSum, weight }] of agg) {
    const share = weight / totalWeight;
    const relative = weightedSum / weight - userMean;
    const emphasis = Math.min(1.5, Math.max(0.5, 1 + relative * 0.2));
    raw[cat] = share * emphasis;
    rawSum += raw[cat];
  }
  return Object.fromEntries(Object.entries(raw).map(([cat, v]) => [cat, v / rawSum]));
}

// ─────────────────────────────────────────────────────
// 2. Build user profile (벡터 포함)
// ─────────────────────────────────────────────────────

async function buildUserProfile(
  ratings: IncomingRating[],
  categoryRatings: IncomingCategoryRating[]
): Promise<{ profile: UserProfile; affinityCtx: AffinityContext }> {
  const emptyCtx = buildAffinityContext([]);
  const empty: UserProfile = {
    topGenres: [], topDirectors: [], topActors: [],
    avoidedGenres: [], avoidedDirectors: [],
    categoryWeights: {}, coldStart: true,
    genreVec: {}, directorVec: {}, actorVec: {},
    avoidedGenreVec: {}, avoidedDirectorVec: {},
  };
  if (ratings.length === 0) return { profile: empty, affinityCtx: emptyCtx };

  // kobis- 접두사 제거 → KOBIS 숫자 코드; tmdb-* ID는 movieCd 자체로 DB 조회
  const kobisCds = ratings
    .map((r) => r.movieId.replace(/^kobis-/, ""))
    .filter((cd) => /^\d+$/.test(cd));
  const tmdbMovieCds = ratings
    .map((r) => r.movieId)
    .filter((id) => /^tmdb-/.test(id));

  const cachedMovies = await db.cachedMovie.findMany({
    where: { movieCd: { in: [...kobisCds, ...tmdbMovieCds] } },
    select: { movieCd: true, genreAlt: true, directorName: true, cast: true },
  });
  const movieMeta = new Map(cachedMovies.map((m) => [m.movieCd, m]));

  // 긍정(≥7) / 부정(≤3) 벡터를 분리해 코사인 유사도 계산에 사용
  const genreVec: Record<string, number> = {};
  const directorVec: Record<string, number> = {};
  const actorVec: Record<string, number> = {};
  const avoidedGenreVec: Record<string, number> = {};
  const avoidedDirectorVec: Record<string, number> = {};
  const directorDataCount = new Map<string, number>(); // 부정 감독 데이터 개수 추적

  // 추천도 배지 계산용: calculateAffinity 공통 함수에 넘길 평점 데이터
  const ratedMoviesForCtx: RatedMovieForContext[] = [];

  for (const rating of ratings) {
    // kobis- 제거 시 숫자면 KOBIS CD; tmdb-* 는 그대로 movieCd로 조회
    const rawId = rating.movieId.replace(/^kobis-/, "");
    const movieCd = /^\d+$/.test(rawId) ? rawId : rating.movieId;
    const meta = movieMeta.get(movieCd);
    if (!meta) continue;

    const w = getTemporalWeight(rating.rating, rating.ratedAt, ratings.length);
    const isPositive = rating.rating >= 7.0;
    const isNegative = rating.rating <= 3.0;

    for (const g of splitGenres(meta.genreAlt)) {
      if (isPositive) genreVec[g] = (genreVec[g] ?? 0) + w;
      if (isNegative) avoidedGenreVec[g] = (avoidedGenreVec[g] ?? 0) + Math.abs(w);
    }
    if (meta.directorName) {
      if (isPositive) directorVec[meta.directorName] = (directorVec[meta.directorName] ?? 0) + w;
      if (isNegative) {
        avoidedDirectorVec[meta.directorName] = (avoidedDirectorVec[meta.directorName] ?? 0) + Math.abs(w);
        directorDataCount.set(meta.directorName, (directorDataCount.get(meta.directorName) ?? 0) + 1);
      }
    }
    // 배우는 감독보다 약하게 (0.7x)
    const castArr = Array.isArray(meta.cast) ? (meta.cast as { name: string }[]) : [];
    for (const person of castArr.slice(0, 5)) {
      if (isPositive) actorVec[person.name] = (actorVec[person.name] ?? 0) + w * 0.7;
    }

    ratedMoviesForCtx.push({
      rating: rating.rating,
      genres: splitGenres(meta.genreAlt),
      directorName: meta.directorName,
      castNames: castArr.slice(0, 5).map((p) => p.name),
    });
  }

  // 채널 검색용 리스트 파생 (벡터에서)
  const topGenres = Object.entries(genreVec)
    .filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
  const avoidedGenres = Object.entries(avoidedGenreVec)
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
  const topDirectors = Object.entries(directorVec)
    .filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d]) => d);
  // 감독 기피: 부정 평점 데이터 2건 이상일 때만
  const avoidedDirectors = Object.entries(avoidedDirectorVec)
    .filter(([d]) => (directorDataCount.get(d) ?? 0) >= 2)
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d);
  const topActors = Object.entries(actorVec)
    .filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([a]) => a);

  const categoryWeights = buildCategoryWeights(ratings, categoryRatings);

  return {
    profile: {
      topGenres, topDirectors, topActors, avoidedGenres, avoidedDirectors,
      categoryWeights, coldStart: false,
      genreVec, directorVec, actorVec, avoidedGenreVec, avoidedDirectorVec,
    },
    affinityCtx: buildAffinityContext(ratedMoviesForCtx),
  };
}

// ─────────────────────────────────────────────────────
// 3. Multi-channel candidate retrieval
// ─────────────────────────────────────────────────────

function parseCast(raw: unknown): { name: string }[] {
  return Array.isArray(raw) ? (raw as { name: string }[]) : [];
}

function toCandidate(m: DbMovie, score: number): CandidateMovie {
  return {
    movieCd: m.movieCd,
    tmdbId: m.tmdbId,
    title: m.title,
    posterUrl: m.posterUrl,
    genreAlt: m.genreAlt,
    directorName: m.directorName,
    cast: parseCast(m.cast),
    allGenres: splitGenres(m.genreAlt),
    totalScore: score,
    reviewAvg: null,
    reviewCount: 0,
    categoryStats: {},
  };
}

// Channel 1: 장르/감독 매칭
async function fetchByGenreDirector(profile: UserProfile, ratedMovieIds: Set<string>): Promise<DbMovie[]> {
  const conditions: object[] = [
    ...profile.topGenres.map((g) => ({ genreAlt: { contains: g } })),
    ...profile.topDirectors.map((d) => ({ directorName: d })),
  ];
  if (conditions.length === 0) return [];
  const rows = await db.cachedMovie.findMany({
    where: { posterUrl: { not: null }, ...EXCLUDE_UNVERIFIED_AWARD, OR: conditions },
    orderBy: { updatedAt: "desc" },
    take: 150,
    select: { movieCd: true, tmdbId: true, title: true, posterUrl: true, genreAlt: true, directorName: true, cast: true },
  });
  return rows.filter((m) => !ratedMovieIds.has(`kobis-${m.movieCd}`) && !ratedMovieIds.has(`tmdb-${m.tmdbId}`)).slice(0, 100);
}

// Channel 1 보조: 배우 단독 매칭 (JSONB raw query)
async function fetchByActors(topActors: string[], ratedMovieIds: Set<string>): Promise<DbMovie[]> {
  if (topActors.length === 0) return [];
  const rows = await db.$queryRaw<DbMovie[]>`
    SELECT DISTINCT "movieCd", "tmdbId", "title", "posterUrl", "genreAlt", "directorName", "cast"
    FROM "CachedMovie"
    WHERE "posterUrl" IS NOT NULL
      AND NOT ("movieCd" LIKE 'wikidata-%' AND "source" <> ${WIKIDATA_VERIFIED})
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements("cast"::jsonb) AS elem
        WHERE elem->>'name' = ANY(${topActors})
      )
    LIMIT 100
  `;
  return rows.filter((m) => !ratedMovieIds.has(`kobis-${m.movieCd}`) && !ratedMovieIds.has(`tmdb-${m.tmdbId}`)).slice(0, 60);
}

// Channel 2: 항목별 선호 특화 — 내가 가장 중시하는 항목에서 다른 사용자들이 높게 평가한
// 영화를 후보로 가져온다. 그 항목 평점이 아직 적으면 항목에 어울리는 장르로 보충한다.
async function fetchByCategory(profile: UserProfile, ratedMovieIds: Set<string>): Promise<DbMovie[]> {
  const topCategory = Object.entries(profile.categoryWeights).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!topCategory) return [];
  const select = { movieCd: true, tmdbId: true, title: true, posterUrl: true, genreAlt: true, directorName: true, cast: true } as const;
  const notRated = (m: DbMovie) => !ratedMovieIds.has(`kobis-${m.movieCd}`) && !ratedMovieIds.has(`tmdb-${m.tmdbId}`);

  const groups = await db.categoryRating.groupBy({
    by: ["movieCd"],
    where: { category: topCategory },
    _avg: { score: true },
  });
  const bestCds = groups
    .filter((g) => g._avg.score !== null && g._avg.score >= 7)
    .sort((a, b) => (b._avg.score ?? 0) - (a._avg.score ?? 0))
    .slice(0, 80)
    .map((g) => g.movieCd);
  const byRating = bestCds.length > 0
    ? (await db.cachedMovie.findMany({ where: { movieCd: { in: bestCds }, posterUrl: { not: null }, ...EXCLUDE_UNVERIFIED_AWARD }, select })).filter(notRated)
    : [];
  if (byRating.length >= 20) return byRating.slice(0, 60);

  const genreMap: Record<string, string[]> = {
    "연출": ["드라마", "스릴러", "SF", "범죄"],
    "편집": ["액션", "스릴러", "SF"],
    "각본": ["드라마", "미스터리", "스릴러"],
    "음악": ["뮤지컬", "애니메이션"],
    "연기": ["드라마", "멜로/로맨스"],
  };
  const byGenre = await db.cachedMovie.findMany({
    where: { posterUrl: { not: null }, ...EXCLUDE_UNVERIFIED_AWARD, OR: (genreMap[topCategory] ?? ["드라마"]).map((g) => ({ genreAlt: { contains: g } })) },
    orderBy: { updatedAt: "desc" },
    take: 80,
    select,
  });
  const seen = new Set(byRating.map((m) => m.movieCd));
  return [...byRating, ...byGenre.filter((m) => notRated(m) && !seen.has(m.movieCd))].slice(0, 60);
}

// Channel 3: 최근 2년 최신작
async function fetchTrending(ratedMovieIds: Set<string>): Promise<DbMovie[]> {
  const twoYearsAgo = new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = await db.cachedMovie.findMany({
    where: { posterUrl: { not: null }, ...EXCLUDE_UNVERIFIED_AWARD, releaseDate: { gte: twoYearsAgo } },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: { movieCd: true, tmdbId: true, title: true, posterUrl: true, genreAlt: true, directorName: true, cast: true },
  });
  return rows.filter((m) => !ratedMovieIds.has(`kobis-${m.movieCd}`) && !ratedMovieIds.has(`tmdb-${m.tmdbId}`)).slice(0, 40);
}

// ─────────────────────────────────────────────────────
// 4. 리뷰 집계 배치 조회 (Bayesian + 항목별 친화도용)
// ─────────────────────────────────────────────────────

type ReviewAggEntry = {
  reviewAvg: number | null;
  reviewCount: number;
  categoryStats: Record<string, { avg: number; count: number }>;
};

async function fetchCandidateReviews(movieCds: string[]): Promise<Map<string, ReviewAggEntry>> {
  if (movieCds.length === 0) return new Map();

  const [groups, categoryGroups] = await Promise.all([
    db.review.groupBy({
      by: ["movieCd"],
      where: { movieCd: { in: movieCds }, type: "SHORT", category: "전체" },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    // 항목 점수는 한줄평·장문평 모두 동기화되는 CategoryRating에서 집계한다.
    db.categoryRating.groupBy({
      by: ["movieCd", "category"],
      where: { movieCd: { in: movieCds }, category: { in: CATEGORY_KEYS } },
      _avg: { score: true },
      _count: { _all: true },
    }),
  ]);

  const result = new Map<string, ReviewAggEntry>();
  const entryFor = (movieCd: string) => {
    let entry = result.get(movieCd);
    if (!entry) {
      entry = { reviewAvg: null, reviewCount: 0, categoryStats: {} };
      result.set(movieCd, entry);
    }
    return entry;
  };
  for (const g of groups) {
    const entry = entryFor(g.movieCd);
    entry.reviewAvg = g._avg.rating;
    entry.reviewCount = g._count._all;
  }
  for (const g of categoryGroups) {
    if (g._avg.score === null) continue;
    entryFor(g.movieCd).categoryStats[g.category] = { avg: g._avg.score, count: g._count._all };
  }
  return result;
}

// ─────────────────────────────────────────────────────
// 5. Candidate scoring
// ─────────────────────────────────────────────────────

// 코사인 유사도 — userVec(가중치 누적), movieVec({tag: 1} 바이너리)
function cosineSimilarity(userVec: Record<string, number>, movieVec: Record<string, number>): number {
  if (Object.keys(userVec).length === 0 || Object.keys(movieVec).length === 0) return 0;
  let dot = 0, userNorm = 0, movieNorm = 0;
  for (const k in userVec) userNorm += userVec[k] ** 2;
  for (const k in movieVec) {
    movieNorm += movieVec[k] ** 2;
    if (userVec[k]) dot += userVec[k] * movieVec[k];
  }
  if (userNorm === 0 || movieNorm === 0) return 0;
  const result = dot / (Math.sqrt(userNorm) * Math.sqrt(movieNorm));
  return isNaN(result) ? 0 : result;
}

// 평점 페널티 계수 — 실제 리뷰 데이터가 5건 이상일 때만 적용한다.
// 리뷰가 부족하면 계수 1.0(변동 없음)으로 두고 베이지안 보정이 자연스럽게 처리하게 둔다.
function getRatingPenaltyFactor(reviewAvg: number | null, reviewCount: number): number {
  if (reviewCount < 5 || reviewAvg === null) return 1.0;
  if (reviewAvg >= 8.5) return 1.15; // 명작 보너스
  if (reviewAvg >= 7.5) return 1.0;  // 양작 — 그대로
  if (reviewAvg >= 6.5) return 0.75; // 평범 — 25% 감점
  return 0.50;                        // 저품질 — 50% 강감점
}

// 베이지안 보정 품질 점수 (소표본 왜곡 방지, 결과 0-1)
// 리뷰가 적을수록 카탈로그 평균 쪽으로 끌어당긴다.
function bayesianQualityScore(movie: CandidateMovie, catalogMean: number): number {
  const v = movie.reviewCount;
  const R = movie.reviewAvg ?? catalogMean;
  const C = catalogMean;
  const m = 20; // 신뢰 최소 건수 기준
  return ((v / (v + m)) * R + (m / (v + m)) * C) / 10;
}

// 항목 궁합 보정 — 영화의 항목별 평점에서 "그 영화 안에서 상대적으로 강한 항목"을 찾고,
// 그 항목을 내가 중시할수록 점수를 조금 올린다(약한 항목이면 조금 내린다).
//  · 상대 강점 = 항목 평균 − 그 영화의 항목 평균 전체 (점 단위, 보통 -2~+2)
//    평가가 적은 항목은 영화 평균 쪽으로 끌어당겨(K건 가상 평가) 1~2명 평가에 휘둘리지 않게 한다.
//  · 보정 = Σ(내 항목 비중 × 상대 강점) / 2 → -1~1로 자른 뒤 × CATEGORY_BOOST_MAX
// 두 개 이상 항목에 평가가 있어야 "다른 항목보다 높다"를 판단할 수 있다.
const CATEGORY_BOOST_MAX = 0.1;
const CATEGORY_SHRINK_K = 3;

function calculateCategoryBoost(
  userCategoryWeights: Record<string, number>,
  movie: CandidateMovie,
): number {
  const stats = Object.values(movie.categoryStats);
  if (Object.keys(userCategoryWeights).length === 0 || stats.length < 2) return 0;
  const totalCount = stats.reduce((sum, s) => sum + s.count, 0);
  const movieMean = stats.reduce((sum, s) => sum + s.avg * s.count, 0) / totalCount;

  let affinity = 0;
  for (const [cat, weight] of Object.entries(userCategoryWeights)) {
    const s = movie.categoryStats[cat];
    if (!s) continue;
    const shrunk = (s.count * s.avg + CATEGORY_SHRINK_K * movieMean) / (s.count + CATEGORY_SHRINK_K);
    affinity += weight * (shrunk - movieMean);
  }
  return Math.max(-1, Math.min(1, affinity / 2)) * CATEGORY_BOOST_MAX;
}

// 최종 후보 점수 계산
function calculateFinalScore(
  movie: CandidateMovie,
  profile: UserProfile,
  catalogMean: number
): number {
  // 영화의 장르/감독/배우를 바이너리 벡터로 변환
  const movieGenreVec: Record<string, number> = Object.fromEntries(movie.allGenres.map((g) => [g, 1]));
  const movieDirectorVec: Record<string, number> = movie.directorName ? { [movie.directorName]: 1 } : {};
  const movieActorVec: Record<string, number> = Object.fromEntries(movie.cast.slice(0, 5).map((a) => [a.name, 1]));

  // 코사인 유사도 기반 사용자 취향 매칭
  const genreSim    = cosineSimilarity(profile.genreVec, movieGenreVec);
  const directorSim = cosineSimilarity(profile.directorVec, movieDirectorVec);
  const actorSim    = cosineSimilarity(profile.actorVec, movieActorVec);
  const userSimScore = 0.5 * genreSim + 0.3 * directorSim + 0.2 * actorSim;

  // 부정 신호 페널티
  const avoidedGenreVecMovie: Record<string, number> = movieGenreVec;
  const avoidedGenreSim     = cosineSimilarity(profile.avoidedGenreVec, avoidedGenreVecMovie);
  const avoidedDirPenalty   = profile.avoidedDirectorVec[movie.directorName ?? ""] ? 0.3 : 0;
  const negativePenalty     = 0.15 * avoidedGenreSim + avoidedDirPenalty;

  // 베이지안 품질 점수
  const qualityScore = bayesianQualityScore(movie, catalogMean);

  // 항목 궁합 보정 (±CATEGORY_BOOST_MAX)
  const categoryBoost = calculateCategoryBoost(profile.categoryWeights, movie);

  const totalScore = 0.55 * userSimScore + 0.45 * qualityScore + categoryBoost;

  // 평점 페널티: 플랫폼 리뷰 평균이 낮으면 취향 유사도가 높아도 최종 점수를 끌어내린다.
  const ratingFactor = getRatingPenaltyFactor(movie.reviewAvg, movie.reviewCount);
  return Math.max(0, Math.min(1, (totalScore - negativePenalty) * ratingFactor));
}

// 장르 모드 후보: 그 장르의 영화(포스터 있는 것) 전체에서 뽑는다. 평점이 없어도(cold start)
// 아래 점수식이 품질 점수만으로 순위를 매긴다.
async function fetchGenrePool(keywords: string[], ratedMovieIds: Set<string>): Promise<DbMovie[]> {
  const rows = await db.cachedMovie.findMany({
    where: {
      posterUrl: { not: null },
      NOT: { movieCd: { startsWith: "wikidata-" } },
      OR: keywords.map((kw) => ({ genreAlt: { contains: kw } })),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { movieCd: true, tmdbId: true, title: true, posterUrl: true, genreAlt: true, directorName: true, cast: true },
  });
  return rows.filter((m) => !ratedMovieIds.has(`kobis-${m.movieCd}`) && !ratedMovieIds.has(`tmdb-${m.tmdbId}`));
}

async function getCandidates(
  profile: UserProfile,
  ratedMovieIds: Set<string>,
  options: { keywords?: string[] | null; poolSize?: number } = {},
): Promise<CandidateMovie[]> {
  const poolSize = options.poolSize ?? 20;
  // Cold start: 최신 영화 20편 반환 + 품질 점수 계산
  if (profile.coldStart && !options.keywords) {
    const recent = await db.cachedMovie.findMany({
      where: { posterUrl: { not: null }, ...EXCLUDE_UNVERIFIED_AWARD, releaseDate: { gte: new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) } },
      orderBy: { updatedAt: "desc" },
      take: 25,
      select: { movieCd: true, tmdbId: true, title: true, posterUrl: true, genreAlt: true, directorName: true, cast: true },
    });
    const coldCandidates = recent
      .filter((m) => !ratedMovieIds.has(`kobis-${m.movieCd}`))
      .slice(0, 20)
      .map((m) => toCandidate(m, 0));

    // 리뷰 집계로 품질 점수 계산 — recommendScore를 항상 반환하기 위해
    const reviewData = await fetchCandidateReviews(coldCandidates.map((c) => c.movieCd));
    const reviewedMovies = [...reviewData.values()].filter((d) => d.reviewAvg !== null && d.reviewCount > 0);
    const catalogMean = reviewedMovies.length > 0
      ? reviewedMovies.reduce((s, d) => s + d.reviewAvg!, 0) / reviewedMovies.length
      : 7.0;
    for (const c of coldCandidates) {
      const rev = reviewData.get(c.movieCd);
      if (rev) {
        c.reviewAvg = rev.reviewAvg;
        c.reviewCount = rev.reviewCount;
      }
      c.totalScore = bayesianQualityScore(c, catalogMean);
    }
    return coldCandidates;
  }

  // 4채널 병렬 조회 후 union (중복 제거). 장르 모드면 그 장르 영화 풀 하나만 쓴다.
  const [genreDirectorRows, actorRows, categoryRows, trendingRows] = options.keywords
    ? [await fetchGenrePool(options.keywords, ratedMovieIds), [], [], []]
    : await Promise.all([
        fetchByGenreDirector(profile, ratedMovieIds),
        fetchByActors(profile.topActors, ratedMovieIds),
        fetchByCategory(profile, ratedMovieIds),
        fetchTrending(ratedMovieIds),
      ]);

  const seenCd = new Set<string>();
  const seenTmdbId = new Set<string>();
  const all: DbMovie[] = [];
  // KOBIS-numeric entries first, then tmdb-* — so the dedup prefers the KOBIS version
  const orderedRows = [
    ...[...genreDirectorRows, ...actorRows, ...categoryRows, ...trendingRows].filter((m) => !/^tmdb-/.test(m.movieCd)),
    ...[...genreDirectorRows, ...actorRows, ...categoryRows, ...trendingRows].filter((m) => /^tmdb-/.test(m.movieCd)),
  ];
  for (const m of orderedRows) {
    if (seenCd.has(m.movieCd)) continue;
    if (ratedMovieIds.has(`kobis-${m.movieCd}`) || ratedMovieIds.has(`tmdb-${m.tmdbId}`)) continue;
    if (m.tmdbId && seenTmdbId.has(m.tmdbId)) continue;
    seenCd.add(m.movieCd);
    if (m.tmdbId) seenTmdbId.add(m.tmdbId);
    all.push(m);
  }

  // 리뷰 집계 배치 조회 (Bayesian 품질 + 항목별 친화도용)
  const reviewData = await fetchCandidateReviews(all.map((m) => m.movieCd));

  // 카탈로그 평균 (리뷰가 1건 이상인 영화들의 평균 평점)
  const reviewedMovies = [...reviewData.values()].filter((d) => d.reviewAvg !== null && d.reviewCount > 0);
  const catalogMean = reviewedMovies.length > 0
    ? reviewedMovies.reduce((s, d) => s + d.reviewAvg!, 0) / reviewedMovies.length
    : 7.0;

  // 후보 생성 + 리뷰 데이터 주입 + 점수 계산
  const scored = all.map((m) => {
    const candidate = toCandidate(m, 0);
    const rev = reviewData.get(m.movieCd);
    if (rev) {
      candidate.reviewAvg = rev.reviewAvg;
      candidate.reviewCount = rev.reviewCount;
      candidate.categoryStats = rev.categoryStats;
    }
    candidate.totalScore = calculateFinalScore(candidate, profile, catalogMean);
    return candidate;
  });

  // 감독 1인당 최대 2편 제약 — LLM에 넘길 후보 풀의 쏠림 방지
  const directorCount = new Map<string, number>();
  const topN: CandidateMovie[] = [];
  for (const c of scored.sort((a, b) => b.totalScore - a.totalScore)) {
    const dir = c.directorName ?? "__unknown__";
    if ((directorCount.get(dir) ?? 0) >= 2) continue;
    directorCount.set(dir, (directorCount.get(dir) ?? 0) + 1);
    topN.push(c);
    if (topN.length >= poolSize) break;
  }
  return topN;
}

// ─────────────────────────────────────────────────────
// 6. LLM reranking (Haiku)
// ─────────────────────────────────────────────────────

async function callLlm(profile: UserProfile, candidates: CandidateMovie[]): Promise<LlmResult> {
  if (candidates.length === 0) return [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const categoryDesc = Object.entries(profile.categoryWeights)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, w]) => `${cat} ${Math.round(w * 100)}%`)
    .join(", ");

  const profileSummary = {
    선호장르: profile.topGenres,
    기피장르: profile.avoidedGenres,
    선호감독: profile.topDirectors,
    기피감독: profile.avoidedDirectors,
    선호배우: profile.topActors.slice(0, 5),
    항목별선호도: categoryDesc || "없음",
  };

  const candidateList = candidates.map((c) => ({
    movieCd: c.movieCd,
    title: c.title,
    genres: c.allGenres,
    director: c.directorName,
    cast: c.cast.slice(0, 3).map((p) => p.name),
    quantScore: Math.round(c.totalScore * 100),
    averageRating: c.reviewAvg !== null ? Math.round(c.reviewAvg * 10) / 10 : null,
    reviewCount: c.reviewCount,
    categoryRatings: Object.keys(c.categoryStats).length > 0
      ? Object.fromEntries(Object.entries(c.categoryStats).map(([k, v]) => [k, Math.round(v.avg * 10) / 10]))
      : null,
  }));

  const systemPrompt = `당신은 영화 추천 알고리즘의 최종 리랭킹 엔진입니다.
1차 정량 스코어(quantScore, 0~100)를 참고하되 아래 규칙에 따라 조정하세요.

[Scoring Rules]
1. Absolute Quality Rule: averageRating이 8.5 이상이고 reviewCount가 20 이상인 검증된 명작은 최종 score가 75 미만으로 떨어지지 않아야 한다. reviewCount가 20 미만이면 소표본이므로 예외로 하고 quantScore를 그대로 신뢰하라.
2. Category Rating Weight Rule: 사용자의 항목별 선호 비중(항목별선호도, %)이 큰 항목에서 그 영화의 다른 항목보다 상대적으로 평점이 높은 영화에 가점을 주라. categoryRatings가 null인 영화는 이 규칙을 건너뛰라.
3. Negative Signal Rule: 사용자의 기피 감독/기피 장르와 겹치는 후보는 감점하라.
4. Reason Rule: 추천 이유(20~40자)에 사용자가 중시하는 항목을 자연스럽게 언급하라.
5. 근거 없이 quantScore 순위를 크게 뒤집지 말 것.

[Response]
- JSON 배열만 반환, 다른 텍스트 없음
- 형식: [{"movieCd":"...", "score":85, "reason":"추천 이유"}, ...]
- score는 0~100 정수, 모든 후보 포함, score 내림차순 정렬`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `사용자 프로필:\n${JSON.stringify(profileSummary, null, 2)}\n\n후보 영화:\n${JSON.stringify(candidateList, null, 2)}`,
        }],
      }),
    });
    if (!res.ok) return [];
    const json = await res.json() as { content: { type: string; text: string }[] };
    const textBlock = json.content.find((b) => b.type === "text");
    if (!textBlock) return [];
    const raw = textBlock.text.trim();
    const jsonStr = raw.startsWith("[") ? raw : raw.slice(raw.indexOf("["));
    return JSON.parse(jsonStr) as LlmResult;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────
// 7. Fallback: fill remaining slots from recent catalogue
// ─────────────────────────────────────────────────────

// MMR 다양성 제약 또는 포스터 누락으로 목표 편수에 못 미칠 때 호출.
// 후보 풀에 없던 최신 영화(포스터 있는 것)에서 부족분만 채운다.
async function fetchFallbackCandidates(
  ratedMovieIds: Set<string>,
  excludeMovieCds: Set<string>,
  needed: number,
  keywords: string[] | null = null,
): Promise<CandidateMovie[]> {
  const rows = await db.cachedMovie.findMany({
    where: {
      posterUrl: { not: null },
      ...EXCLUDE_UNVERIFIED_AWARD,
      ...(keywords ? { OR: keywords.map((kw) => ({ genreAlt: { contains: kw } })) } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: needed * 5,
    select: { movieCd: true, tmdbId: true, title: true, posterUrl: true, genreAlt: true, directorName: true, cast: true },
  });
  return rows
    .filter(
      (m) =>
        !excludeMovieCds.has(m.movieCd) &&
        !ratedMovieIds.has(`kobis-${m.movieCd}`) &&
        (m.tmdbId === null || !ratedMovieIds.has(`tmdb-${m.tmdbId}`)),
    )
    .slice(0, needed)
    .map((m) => toCandidate(m, 0.1));
}

// ─────────────────────────────────────────────────────
// 8. Final score blend + MMR diversity (→ Top 10)
// ─────────────────────────────────────────────────────

type ScoredCandidate = {
  candidate: CandidateMovie;
  finalScore: number;
  llmScore: number | undefined;
  reason: string | undefined;
};

function blendAndMMR(
  candidates: CandidateMovie[],
  llmMap: Map<string, { score: number; reason: string }>,
  limit: number,
  genreCapEnabled = true,
): ScoredCandidate[] {
  // 정량 50% + LLM 50% 블렌딩
  const scored: ScoredCandidate[] = candidates.map((c) => {
    const llm = llmMap.get(c.movieCd);
    const llmScore = llm?.score;
    const finalScore = llmScore !== undefined
      ? 0.5 * c.totalScore + 0.5 * (llmScore / 100)
      : c.totalScore;
    return { candidate: c, finalScore, llmScore, reason: llm?.reason };
  }).sort((a, b) => b.finalScore - a.finalScore);

  // MMR: 감독 1인당 최대 1편, 단일 장르 50% 상한
  const result: ScoredCandidate[] = [];
  const directorSeen = new Set<string>();
  const genreCount = new Map<string, number>();
  const genreCap = Math.floor(limit * 0.5);

  for (const item of scored) {
    if (result.length >= limit) break;
    const dir = item.candidate.directorName ?? "__unknown__";
    if (directorSeen.has(dir)) continue;
    if (genreCapEnabled && item.candidate.allGenres.some((g) => (genreCount.get(g) ?? 0) >= genreCap)) continue;

    directorSeen.add(dir);
    for (const g of item.candidate.allGenres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
    result.push(item);
  }
  return result;
}

// ─────────────────────────────────────────────────────
// POST /api/recommendations
// ─────────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return NextResponse.json({ results: [] });
  }

  const { myRatings = [], myCategoryRatings = [] } = body;
  const keywords = body.genre ? GENRE_KEYWORDS[body.genre] ?? null : null;
  const TARGET = Math.min(20, Math.max(1, Math.floor(body.limit ?? 10)));

  // 동일 입력에 대한 2분 캐시 히트 → 즉시 반환
  const cacheKey = `${hashBody(myRatings, myCategoryRatings)}|${keywords ? body.genre : ""}|${TARGET}`;
  const cached = recServerCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  const ratedMovieIds = new Set(myRatings.map((r) => r.movieId));

  const { profile, affinityCtx } = await buildUserProfile(myRatings, myCategoryRatings);
  const candidates = await getCandidates(profile, ratedMovieIds, { keywords, poolSize: Math.max(20, TARGET * 2) });

  if (candidates.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const movieCds = candidates.map((c) => c.movieCd);
  const cachedLlm = llmCache.get(cacheKey);
  const llmResults = cachedLlm && cachedLlm.expiresAt > Date.now() ? cachedLlm.results : [];
  // LLM 리랭킹은 홈 추천에만 쓴다(장르 탭마다 돌리면 호출 비용이 장르 수만큼 늘어난다).
  if (llmResults.length === 0 && !keywords) {
    after(async () => {
      const results = await callLlm(profile, candidates).catch(() => [] as LlmResult);
      if (results.length === 0) return;
      if (llmCache.size >= REC_CACHE_MAX) {
        const oldestKey = llmCache.keys().next().value;
        if (oldestKey !== undefined) llmCache.delete(oldestKey);
      }
      llmCache.set(cacheKey, { results, expiresAt: Date.now() + LLM_CACHE_TTL });
      recServerCache.delete(cacheKey); // 다음 요청이 LLM 결과로 다시 계산되도록
    });
  }
  // 후보는 전부 cachedMovie에서 뽑혔으므로 외부 API 재조회 없이 DB만 읽는다.
  const metas = await getCachedMovieMetas(movieCds);

  const llmMap = new Map(llmResults.map((r) => [r.movieCd, r]));
  const final = blendAndMMR(candidates, llmMap, TARGET, !keywords);

  const buildRowMovie = (
    c: CandidateMovie,
    posterUrl: string | null,
    genreAlt: string | null,
    reason?: string,
  ): RowMovie => {
    const { genre, allGenres } = genreFields(genreAlt);
    const affinityScore = calculateMovieAffinity(
      { genres: allGenres, directorName: c.directorName, castNames: c.cast.map((p) => p.name) },
      affinityCtx,
      computeBayesianQuality(c.reviewAvg, c.reviewCount),
    );
    return {
      id: `kobis-${c.movieCd}`,
      title: c.title,
      posterUrl,
      gradient: FALLBACK_GRADIENT_VAL,
      isNowShowing: false,
      genre,
      allGenres,
      recommendScore: Math.min(99, Math.max(1, Math.round(100 * affinityScore))),
      recommendReason: reason,
    };
  };

  const results: RowMovie[] = final
    .map(({ candidate: c, reason }) => {
      const meta = metas.get(c.movieCd);
      return buildRowMovie(c, meta?.posterUrl ?? c.posterUrl, meta?.genreAlt ?? c.genreAlt, reason ?? undefined);
    })
    .filter((r) => r.posterUrl !== null);

  // Fallback fill: MMR 다양성 제약 또는 포스터 없는 영화 제거로 10편 미만이 되면
  // 후보 풀 밖의 최신 영화로 채운다.
  if (results.length < TARGET) {
    const needed = TARGET - results.length;
    const excludeMovieCds = new Set(candidates.map((c) => c.movieCd));
    const fallback = await fetchFallbackCandidates(ratedMovieIds, excludeMovieCds, needed, keywords);
    if (fallback.length > 0) {
      const fallbackMetas = await getCachedMovieMetas(fallback.map((c) => c.movieCd));
      for (const c of fallback) {
        const meta = fallbackMetas.get(c.movieCd);
        const posterUrl = meta?.posterUrl ?? c.posterUrl;
        if (!posterUrl) continue;
        results.push(buildRowMovie(c, posterUrl, meta?.genreAlt ?? c.genreAlt));
        if (results.length >= TARGET) break;
      }
    }
  }

  // 다른 행의 카드처럼 사이트 평점(한줄평·장문평 평균과 평가 인원)을 붙인다.
  const avgMap = await getBulkMovieRatingAverages(results.map((r) => r.id.replace(/^kobis-/, "")));
  const payload = {
    results: results.map((r) => {
      const avgs = avgMap.get(r.id.replace(/^kobis-/, ""));
      return { ...r, shortAvg: avgs?.shortAvg ?? null, shortCount: avgs?.shortCount ?? null, longAvg: avgs?.longAvg ?? null };
    }),
  };

  // 결과 캐싱 (FIFO 방식으로 최대 200개 유지)
  if (recServerCache.size >= REC_CACHE_MAX) {
    const oldestKey = recServerCache.keys().next().value;
    if (oldestKey !== undefined) recServerCache.delete(oldestKey);
  }
  recServerCache.set(cacheKey, { data: payload, expiresAt: Date.now() + REC_CACHE_TTL });

  return NextResponse.json(payload);
}

// Keep GET for backwards compatibility (returns empty)
export async function GET() {
  return NextResponse.json({ results: [] });
}
