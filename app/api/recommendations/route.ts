import { NextResponse, after } from "next/server";
import { db } from "../../_lib/db";
import { getBulkMovieRatingAverages } from "../../_lib/review-data";
import { getCachedMovieMetas, WIKIDATA_VERIFIED } from "../../_lib/movie-rate-info";
import { isAdultContent, NOT_ADULT_GENRE_WHERE } from "../../_lib/adult-content";
import { genreFields, GENRE_KEYWORDS } from "../../_lib/movie-rows";
import type { RowMovie } from "../../_lib/movie-rows";
import { genreQueryKeywords } from "../../_lib/genre-canon";
import {
  cdToMovieId,
  movieIdToCd,
  sanitizeCategoryRatings,
  sanitizeRatings,
  type CategoryRatingInput,
  type RatingInput,
} from "../../_lib/rating-input";
import { calculateCategoryBoost, recencyDecay } from "../../_lib/calculateAffinity";
import {
  buildTasteContext,
  loadQualityStats,
  scoreAffinityWithCf,
  toTasteMeta,
  type QualityStats,
  type TasteContext,
  type TasteMeta,
} from "../../_lib/affinity-data";
import { createCfScorer } from "../../_lib/cf-data";

// 외부 API·AI 응답이 늦어도 이 시간 안에 끝낸다(함수가 오래 붙잡혀 사용량이 늘지 않게).
export const maxDuration = 30;

const FALLBACK_GRADIENT_VAL = "from-neutral-800 via-neutral-600 to-neutral-400";

// 수상작 항목(wikidata-*) 중 TMDB 연결 검증 전인 것은 다른 영화의 포스터·장르가 붙어
// 있을 수 있어 추천 후보에서 뺀다(평점 페이지 조회 시 검증되면 다시 포함된다).
const EXCLUDE_UNVERIFIED_AWARD = {
  NOT: { movieCd: { startsWith: "wikidata-" }, source: { not: WIKIDATA_VERIFIED } },
  AND: [NOT_ADULT_GENRE_WHERE], // 에로·성인 장르는 추천하지 않는다
};

const MOVIE_SELECT = {
  movieCd: true,
  tmdbId: true,
  title: true,
  posterUrl: true,
  genreAlt: true,
  directorName: true,
  cast: true,
} as const;

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
const LLM_TIMEOUT_MS = 20_000;

function hashInput(ratings: RatingInput[], catRatings: CategoryRatingInput[]): string {
  const rStr = ratings.map((r) => `${r.movieId}:${r.rating}:${r.ratedAt ?? ""}`).sort().join(",");
  const cStr = catRatings.map((r) => `${r.movieId}:${r.category}:${r.value}`).sort().join(",");
  let h = 0;
  for (const ch of rStr + "|" + cStr) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return String(h >>> 0);
}

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

type UserProfile = {
  // 채널 검색용 리스트
  topGenres: string[]; // 대표 장르(genre-canon.ts)
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
  avoidedDirectorCounts: Record<string, number>; // 감독별 낮은 평점 개수
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
  taste: TasteMeta; // 대표 장르·감독·상위 배우 — 취향 계산용
  totalScore: number;
  // 사이트 평점 집계 (베이지안 품질 점수 + 항목 궁합 보정용) — 추천도 배지와 같은 재료
  quality: QualityStats;
};

type LlmResult = { movieCd: string; score: number; reason: string }[];

type IsRated = (movie: { movieCd: string; tmdbId: string | null }) => boolean;

const EMPTY_QUALITY: QualityStats = Object.freeze({ overallAvg: null, overallCount: 0, categoryStats: {} });

// ─────────────────────────────────────────────────────
// 1. Temporal weighting
// ─────────────────────────────────────────────────────

// 최근 평가일수록, 기준점에서 먼 평점일수록 강하게 반영 (-5~+5 범위).
function getTemporalWeight(rating: number, ratedAt: string | null, totalCount: number): number {
  return (rating - 5) * recencyDecay(ratedAt, totalCount);
}

// ─────────────────────────────────────────────────────
// 2. Build user profile (벡터 포함)
// ─────────────────────────────────────────────────────

// 좋아한 영화 기준: 보통은 7점 이상. 평점을 박하게 주는 사용자(평균 6점 미만)는 7점 이상이
// 거의 없어 예전엔 개인화가 아예 안 됐다 — 그런 사용자는 "내 평균보다 0.5점 이상 높게 준
// 영화"(단, 5.5점 이상)를 좋아한 영화로 본다.
function positiveThreshold(ratings: RatingInput[]): number {
  if (ratings.length === 0) return 7;
  const mean = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
  return Math.min(7, Math.max(5.5, mean + 0.5));
}

function buildUserProfile(ratings: RatingInput[], taste: TasteContext): UserProfile {
  const profile: UserProfile = {
    topGenres: [], topDirectors: [], topActors: [],
    avoidedGenres: [], avoidedDirectors: [],
    categoryWeights: taste.ctx.categoryWeights,
    coldStart: ratings.length === 0,
    genreVec: {}, directorVec: {}, actorVec: {},
    avoidedGenreVec: {}, avoidedDirectorVec: {}, avoidedDirectorCounts: {},
  };
  if (ratings.length === 0) return profile;

  const { genreVec, directorVec, actorVec, avoidedGenreVec, avoidedDirectorVec, avoidedDirectorCounts } = profile;
  const likeThreshold = positiveThreshold(ratings);

  for (const rating of ratings) {
    const cd = movieIdToCd(rating.movieId);
    const meta = cd ? taste.ratedMetas.get(cd) : undefined;
    if (!meta) continue;

    const w = getTemporalWeight(rating.rating, rating.ratedAt, ratings.length);
    const isPositive = rating.rating >= likeThreshold && w > 0;
    const isNegative = rating.rating <= 3.0;

    for (const g of meta.genres) {
      if (isPositive) genreVec[g] = (genreVec[g] ?? 0) + w;
      if (isNegative) avoidedGenreVec[g] = (avoidedGenreVec[g] ?? 0) + Math.abs(w);
    }
    if (meta.directorName) {
      const d = meta.directorName;
      if (isPositive) directorVec[d] = (directorVec[d] ?? 0) + w;
      if (isNegative) {
        avoidedDirectorVec[d] = (avoidedDirectorVec[d] ?? 0) + Math.abs(w);
        avoidedDirectorCounts[d] = (avoidedDirectorCounts[d] ?? 0) + 1;
      }
    }
    // 배우는 감독보다 약하게 (0.7x)
    for (const name of meta.castNames) {
      if (isPositive) actorVec[name] = (actorVec[name] ?? 0) + w * 0.7;
    }
  }

  // 채널 검색용 리스트 파생 (벡터에서)
  profile.topGenres = Object.entries(genreVec)
    .filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
  profile.avoidedGenres = Object.entries(avoidedGenreVec)
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
  profile.topDirectors = Object.entries(directorVec)
    .filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d]) => d);
  // 감독 기피: 부정 평점 데이터 2건 이상일 때만
  profile.avoidedDirectors = Object.entries(avoidedDirectorVec)
    .filter(([d]) => (avoidedDirectorCounts[d] ?? 0) >= 2)
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d);
  profile.topActors = Object.entries(actorVec)
    .filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([a]) => a);

  return profile;
}

// ─────────────────────────────────────────────────────
// 3. Multi-channel candidate retrieval
// ─────────────────────────────────────────────────────

function toCandidate(m: DbMovie): CandidateMovie {
  return {
    movieCd: m.movieCd,
    tmdbId: m.tmdbId,
    title: m.title,
    posterUrl: m.posterUrl,
    genreAlt: m.genreAlt,
    taste: toTasteMeta(m),
    totalScore: 0,
    quality: EMPTY_QUALITY,
  };
}

// Channel 1: 장르/감독 매칭
async function fetchByGenreDirector(profile: UserProfile, isRated: IsRated): Promise<DbMovie[]> {
  // 대표 장르 → 출처별 표기("로맨스" → "멜로"·"로맨스")로 풀어서 검색한다.
  const genreKeywords = [...new Set(profile.topGenres.flatMap(genreQueryKeywords))];
  const conditions: object[] = [
    ...genreKeywords.map((kw) => ({ genreAlt: { contains: kw } })),
    ...profile.topDirectors.map((d) => ({ directorName: d })),
  ];
  if (conditions.length === 0) return [];
  const rows = await db.cachedMovie.findMany({
    where: { posterUrl: { not: null }, ...EXCLUDE_UNVERIFIED_AWARD, OR: conditions },
    orderBy: { updatedAt: "desc" },
    take: 150,
    select: MOVIE_SELECT,
  });
  return rows.filter((m) => !isRated(m)).slice(0, 100);
}

// Channel 1 보조: 배우 단독 매칭 (JSONB raw query)
// 출연진 JSON 배열에 선호 배우가 있는지는 jsonb 포함 연산(@>)으로 본다 — 배열이 아닌 값이
// 섞여 있어도 오류 없이 false가 된다(jsonb_array_elements는 그런 행 하나로 쿼리 전체가 실패).
async function fetchByActors(topActors: string[], isRated: IsRated): Promise<DbMovie[]> {
  if (topActors.length === 0) return [];
  const rows = await db.$queryRaw<DbMovie[]>`
    SELECT "movieCd", "tmdbId", "title", "posterUrl", "genreAlt", "directorName", "cast"
    FROM "CachedMovie"
    WHERE "posterUrl" IS NOT NULL
      AND NOT ("movieCd" LIKE 'wikidata-%' AND "source" <> ${WIKIDATA_VERIFIED})
      AND ("genreAlt" IS NULL OR ("genreAlt" NOT LIKE '%에로%' AND "genreAlt" NOT LIKE '%성인%'))
      AND EXISTS (
        SELECT 1 FROM unnest(${topActors}::text[]) AS actor(name)
        WHERE "cast" @> jsonb_build_array(jsonb_build_object('name', actor.name))
      )
    ORDER BY "updatedAt" DESC
    LIMIT 100
  `;
  return rows.filter((m) => !isRated(m)).slice(0, 60);
}

// Channel 2: 항목별 선호 특화 — 내가 가장 중시하는 항목에서 다른 사용자들이 높게 평가한
// 영화를 후보로 가져온다. 그 항목 평점이 아직 적으면 항목에 어울리는 장르로 보충한다.
async function fetchByCategory(profile: UserProfile, isRated: IsRated): Promise<DbMovie[]> {
  const topCategory = Object.entries(profile.categoryWeights).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!topCategory) return [];

  const groups = await db.categoryRating.groupBy({
    by: ["movieCd"],
    where: { category: topCategory },
    _avg: { score: true },
    _count: { _all: true },
  });
  // 한 명이 준 10점 하나로 "그 항목이 뛰어난 영화"가 되지 않게, 2명 이상이 평가한 영화만
  // 보고 평가 수가 적을수록 6.5점 쪽으로 당긴 점수로 고른다.
  const bestCds = groups
    .flatMap((g) => {
      const avg = g._avg.score;
      const count = g._count._all;
      if (avg === null || count < 2) return [];
      return [{ movieCd: g.movieCd, score: (count * avg + 2 * 6.5) / (count + 2) }];
    })
    .filter((g) => g.score >= 7)
    .sort((a, b) => b.score - a.score)
    .slice(0, 80)
    .map((g) => g.movieCd);
  const byRating = bestCds.length > 0
    ? (await db.cachedMovie.findMany({
        where: { movieCd: { in: bestCds }, posterUrl: { not: null }, ...EXCLUDE_UNVERIFIED_AWARD },
        select: MOVIE_SELECT,
      })).filter((m) => !isRated(m))
    : [];
  if (byRating.length >= 20) return byRating.slice(0, 60);

  const genreMap: Record<string, string[]> = {
    "연출": ["드라마", "스릴러", "SF", "범죄"],
    "편집": ["액션", "스릴러", "SF"],
    "각본": ["드라마", "미스터리", "스릴러"],
    "음악": ["뮤지컬", "애니메이션"],
    "연기": ["드라마", "로맨스"],
  };
  const keywords = [...new Set((genreMap[topCategory] ?? ["드라마"]).flatMap(genreQueryKeywords))];
  const byGenre = await db.cachedMovie.findMany({
    where: { posterUrl: { not: null }, ...EXCLUDE_UNVERIFIED_AWARD, OR: keywords.map((kw) => ({ genreAlt: { contains: kw } })) },
    orderBy: { updatedAt: "desc" },
    take: 80,
    select: MOVIE_SELECT,
  });
  const seen = new Set(byRating.map((m) => m.movieCd));
  return [...byRating, ...byGenre.filter((m) => !isRated(m) && !seen.has(m.movieCd))].slice(0, 60);
}

// Channel 3: 최근 2년 최신작
async function fetchTrending(isRated: IsRated): Promise<DbMovie[]> {
  const twoYearsAgo = new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = await db.cachedMovie.findMany({
    where: { posterUrl: { not: null }, ...EXCLUDE_UNVERIFIED_AWARD, releaseDate: { gte: twoYearsAgo } },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: MOVIE_SELECT,
  });
  return rows.filter((m) => !isRated(m)).slice(0, 40);
}

// 장르 모드 후보: 그 장르의 영화(포스터 있는 것) 전체에서 뽑는다. 평점이 없어도(cold start)
// 아래 점수식이 품질 점수만으로 순위를 매긴다.
async function fetchGenrePool(keywords: string[], isRated: IsRated): Promise<DbMovie[]> {
  const rows = await db.cachedMovie.findMany({
    where: {
      posterUrl: { not: null },
      NOT: { movieCd: { startsWith: "wikidata-" } },
      OR: keywords.map((kw) => ({ genreAlt: { contains: kw } })),
      AND: [NOT_ADULT_GENRE_WHERE],
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: MOVIE_SELECT,
  });
  return rows.filter((m) => !isRated(m));
}

// ─────────────────────────────────────────────────────
// 4. Candidate scoring
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
function bayesianQualityScore(quality: QualityStats, catalogMean: number): number {
  const v = quality.overallCount;
  const R = quality.overallAvg ?? catalogMean;
  const m = 20; // 신뢰 최소 건수 기준
  return ((v / (v + m)) * R + (m / (v + m)) * catalogMean) / 10;
}

// 후보들 중 사이트 평점이 있는 영화들의 평균 — 베이지안 보정의 기준점
function catalogMeanOf(stats: Iterable<QualityStats>): number {
  let sum = 0;
  let count = 0;
  for (const q of stats) {
    if (q.overallAvg === null || q.overallCount === 0) continue;
    sum += q.overallAvg;
    count++;
  }
  return count > 0 ? sum / count : 7.0;
}

// 기피 감독 페널티 — 낮은 평점이 2건 이상이면 확실한 기피(0.3), 1건뿐이면 약하게(0.1).
// 같은 감독 영화를 좋아한 기록이 더 크면 기피로 보지 않는다. (예전엔 낮은 평점 1건만
// 있어도, 그 감독의 다른 영화를 좋아했어도 무조건 0.3을 깎았다.)
function avoidedDirectorPenalty(profile: UserProfile, director: string | null): number {
  if (!director) return 0;
  const negative = profile.avoidedDirectorVec[director] ?? 0;
  if (negative <= (profile.directorVec[director] ?? 0)) return 0;
  return (profile.avoidedDirectorCounts[director] ?? 0) >= 2 ? 0.3 : 0.1;
}

// 최종 후보 점수 계산
function calculateFinalScore(movie: CandidateMovie, profile: UserProfile, catalogMean: number): number {
  // 영화의 장르/감독/배우를 바이너리 벡터로 변환
  const movieGenreVec: Record<string, number> = Object.fromEntries(movie.taste.genres.map((g) => [g, 1]));
  const movieDirectorVec: Record<string, number> = movie.taste.directorName ? { [movie.taste.directorName]: 1 } : {};
  const movieActorVec: Record<string, number> = Object.fromEntries(movie.taste.castNames.map((a) => [a, 1]));

  // 코사인 유사도 기반 사용자 취향 매칭
  const genreSim    = cosineSimilarity(profile.genreVec, movieGenreVec);
  const directorSim = cosineSimilarity(profile.directorVec, movieDirectorVec);
  const actorSim    = cosineSimilarity(profile.actorVec, movieActorVec);
  const userSimScore = 0.5 * genreSim + 0.3 * directorSim + 0.2 * actorSim;

  // 부정 신호 페널티
  const avoidedGenreSim = cosineSimilarity(profile.avoidedGenreVec, movieGenreVec);
  const negativePenalty = 0.15 * avoidedGenreSim + avoidedDirectorPenalty(profile, movie.taste.directorName);

  // 베이지안 품질 점수
  const qualityScore = bayesianQualityScore(movie.quality, catalogMean);

  // 항목 궁합 보정 (±0.1)
  const categoryBoost = calculateCategoryBoost(profile.categoryWeights, movie.quality.categoryStats);

  const totalScore = 0.55 * userSimScore + 0.45 * qualityScore + categoryBoost;

  // 평점 페널티: 플랫폼 리뷰 평균이 낮으면 취향 유사도가 높아도 최종 점수를 끌어내린다.
  const ratingFactor = getRatingPenaltyFactor(movie.quality.overallAvg, movie.quality.overallCount);
  return Math.max(0, Math.min(1, (totalScore - negativePenalty) * ratingFactor));
}

async function withQuality(candidates: CandidateMovie[]): Promise<Map<string, QualityStats>> {
  const stats = await loadQualityStats(candidates.map((c) => c.movieCd));
  for (const c of candidates) c.quality = stats.get(c.movieCd) ?? EMPTY_QUALITY;
  return stats;
}

// 채널 하나가 실패해도(DB 오류 등) 나머지 채널 후보로 추천을 이어간다.
function settle(promise: Promise<DbMovie[]>, channel: string): Promise<DbMovie[]> {
  return promise.catch((error) => {
    console.warn(`[recommendations] ${channel} 후보 조회 실패:`, error);
    return [];
  });
}

async function getCandidates(
  profile: UserProfile,
  isRated: IsRated,
  options: { keywords?: string[] | null; poolSize?: number } = {},
): Promise<CandidateMovie[]> {
  const poolSize = options.poolSize ?? 20;
  // Cold start: 최신 영화 20편 + 품질 점수
  if (profile.coldStart && !options.keywords) {
    const recent = await db.cachedMovie.findMany({
      where: { posterUrl: { not: null }, ...EXCLUDE_UNVERIFIED_AWARD, releaseDate: { gte: new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) } },
      orderBy: { updatedAt: "desc" },
      take: 25,
      select: MOVIE_SELECT,
    });
    const coldCandidates = recent.filter((m) => !isRated(m)).slice(0, 20).map(toCandidate);
    const stats = await withQuality(coldCandidates);
    const catalogMean = catalogMeanOf(stats.values());
    for (const c of coldCandidates) c.totalScore = bayesianQualityScore(c.quality, catalogMean);
    return coldCandidates;
  }

  // 4채널 병렬 조회 후 union (중복 제거). 장르 모드면 그 장르 영화 풀 하나만 쓴다.
  const channels = options.keywords
    ? [await settle(fetchGenrePool(options.keywords, isRated), "genre")]
    : await Promise.all([
        settle(fetchByGenreDirector(profile, isRated), "genre-director"),
        settle(fetchByActors(profile.topActors, isRated), "actor"),
        settle(fetchByCategory(profile, isRated), "category"),
        settle(fetchTrending(isRated), "trending"),
      ]);
  const rows = channels.flat();

  // KOBIS 코드(숫자) 항목을 먼저 — 같은 영화가 tmdb-*·wikidata-* 항목으로도 저장돼 있으면
  // TMDB id로 겹침을 찾아 KOBIS 쪽을 남긴다.
  const isKobis = (m: DbMovie) => /^\d+$/.test(m.movieCd);
  const seenCd = new Set<string>();
  const seenTmdbId = new Set<string>();
  const unique: DbMovie[] = [];
  for (const m of [...rows.filter(isKobis), ...rows.filter((m) => !isKobis(m))]) {
    if (seenCd.has(m.movieCd) || isRated(m)) continue;
    if (m.tmdbId && seenTmdbId.has(m.tmdbId)) continue;
    seenCd.add(m.movieCd);
    if (m.tmdbId) seenTmdbId.add(m.tmdbId);
    unique.push(m);
  }

  const candidates = unique.map(toCandidate);
  const stats = await withQuality(candidates);
  const catalogMean = catalogMeanOf(stats.values());
  for (const c of candidates) c.totalScore = calculateFinalScore(c, profile, catalogMean);

  // 감독 1인당 최대 2편 — LLM에 넘길 후보 풀의 쏠림 방지. 감독 정보가 없는 영화끼리는 같은
  // 감독으로 보지 않는다(예전엔 전부 한 명으로 묶여 감독 정보 없는 영화가 2편까지만 남았다).
  const directorCount = new Map<string, number>();
  const topN: CandidateMovie[] = [];
  for (const c of candidates.sort((a, b) => b.totalScore - a.totalScore)) {
    const dir = c.taste.directorName;
    if (dir) {
      if ((directorCount.get(dir) ?? 0) >= 2) continue;
      directorCount.set(dir, (directorCount.get(dir) ?? 0) + 1);
    }
    topN.push(c);
    if (topN.length >= poolSize) break;
  }
  return topN;
}

// ─────────────────────────────────────────────────────
// 5. LLM reranking (Haiku)
// ─────────────────────────────────────────────────────

// LLM 응답에서 항목을 읽는다. 앞뒤에 설명이 붙거나 max_tokens로 끝이 잘려도 완성된 항목은
// 살리고, 형식이 틀린 항목(점수가 숫자가 아님, 후보에 없는 movieCd)은 버린다.
function parseLlmResults(text: string, validCds: Set<string>): LlmResult {
  const start = text.indexOf("[");
  if (start === -1) return [];
  const end = text.lastIndexOf("]");
  let items: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(end > start ? text.slice(start, end + 1) : "");
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    for (const match of text.slice(start).matchAll(/\{[^{}]*\}/g)) {
      try {
        items.push(JSON.parse(match[0]));
      } catch {
        // 불완전한 항목은 건너뛴다
      }
    }
  }

  const results: LlmResult = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const { movieCd, score, reason } = item as Record<string, unknown>;
    if (typeof movieCd !== "string" || !validCds.has(movieCd)) continue;
    const numeric = typeof score === "number" ? score : Number(score);
    if (!Number.isFinite(numeric)) continue;
    results.push({
      movieCd,
      score: Math.min(100, Math.max(0, numeric)),
      reason: typeof reason === "string" ? reason.trim().slice(0, 60) : "",
    });
  }
  return results;
}

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
    genres: c.taste.genres,
    director: c.taste.directorName,
    cast: c.taste.castNames.slice(0, 3),
    quantScore: Math.round(c.totalScore * 100),
    averageRating: c.quality.overallAvg !== null ? Math.round(c.quality.overallAvg * 10) / 10 : null,
    reviewCount: c.quality.overallCount,
    categoryRatings: Object.keys(c.quality.categoryStats).length > 0
      ? Object.fromEntries(Object.entries(c.quality.categoryStats).map(([k, v]) => [k, Math.round(v.avg * 10) / 10]))
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
      // 후보 20~40편의 이유 문장까지 담으려면 1500토큰으로는 잘릴 수 있어 넉넉히 잡는다.
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `사용자 프로필:\n${JSON.stringify(profileSummary, null, 2)}\n\n후보 영화:\n${JSON.stringify(candidateList, null, 2)}`,
        }],
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = json.content?.find((b) => b.type === "text")?.text;
    if (!text) return [];
    return parseLlmResults(text, new Set(candidates.map((c) => c.movieCd)));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────
// 6. Fallback: fill remaining slots from recent catalogue
// ─────────────────────────────────────────────────────

// MMR 다양성 제약 또는 포스터 누락으로 목표 편수에 못 미칠 때 호출.
// 후보 풀에 없던 최신 영화(포스터 있는 것)에서 부족분만 채운다.
async function fetchFallbackCandidates(
  isRated: IsRated,
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
    take: needed * 5 + excludeMovieCds.size,
    select: MOVIE_SELECT,
  });
  const fallback = rows
    .filter((m) => !excludeMovieCds.has(m.movieCd) && !isRated(m))
    .slice(0, needed * 2)
    .map(toCandidate);
  await withQuality(fallback); // 추천도 배지를 다른 카드와 같은 재료로 계산하기 위해
  return fallback;
}

// ─────────────────────────────────────────────────────
// 7. Final score blend + MMR diversity
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
    return { candidate: c, finalScore, llmScore, reason: llm?.reason || undefined };
  }).sort((a, b) => b.finalScore - a.finalScore);

  // MMR: 감독 1인당 최대 1편, 단일 장르 50% 상한
  const result: ScoredCandidate[] = [];
  const picked = new Set<string>();
  const directorSeen = new Set<string>();
  const genreCount = new Map<string, number>();
  const genreCap = Math.max(1, Math.floor(limit * 0.5));

  const pick = (useGenreCap: boolean) => {
    for (const item of scored) {
      if (result.length >= limit) return;
      const c = item.candidate;
      if (picked.has(c.movieCd)) continue;
      const dir = c.taste.directorName; // 감독 정보가 없는 영화끼리는 같은 감독으로 보지 않는다
      if (dir && directorSeen.has(dir)) continue;
      if (useGenreCap && c.taste.genres.some((g) => (genreCount.get(g) ?? 0) >= genreCap)) continue;

      picked.add(c.movieCd);
      if (dir) directorSeen.add(dir);
      for (const g of c.taste.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
      result.push(item);
    }
  };
  pick(genreCapEnabled);
  // 장르 상한 때문에 자리가 남으면, 취향과 무관한 최신작(fallback)으로 채우기 전에 상한을
  // 풀고 다음 순위 후보부터 채운다.
  if (genreCapEnabled && result.length < limit) pick(false);
  return result;
}

// ─────────────────────────────────────────────────────
// POST /api/recommendations
// ─────────────────────────────────────────────────────

async function buildRecommendations(
  myRatings: RatingInput[],
  myCategoryRatings: CategoryRatingInput[],
  keywords: string[] | null,
  target: number,
  cacheKey: string,
): Promise<{ results: RowMovie[] }> {
  const [taste, cf] = await Promise.all([
    buildTasteContext(myRatings, myCategoryRatings),
    createCfScorer(myRatings).catch(() => null),
  ]);
  // 이미 평가한 영화는 추천하지 않는다 — 같은 영화가 KOBIS·TMDB 두 항목으로 저장된 경우도
  // TMDB id로 함께 거른다(예전엔 다른 항목으로 저장된 같은 영화가 다시 추천됐다).
  const isRated: IsRated = (m) => taste.ratedCds.has(m.movieCd) || (m.tmdbId !== null && taste.ratedTmdbIds.has(m.tmdbId));
  const profile = buildUserProfile(myRatings, taste);
  const candidates = await getCandidates(profile, isRated, { keywords, poolSize: Math.max(20, target * 2) });
  if (candidates.length === 0) return { results: [] };

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
  const [metas] = await Promise.all([
    getCachedMovieMetas(candidates.map((c) => c.movieCd)),
    cf?.prefetch(candidates.map((c) => c.movieCd)),
  ]);

  const llmMap = new Map(llmResults.map((r) => [r.movieCd, r]));
  const final = blendAndMMR(candidates, llmMap, target, !keywords);

  // 카드의 "추천 N%"는 순위 점수가 아니라 모든 행 공통 추천도(affinity-data.ts)다 — 같은
  // 영화가 다른 행에 나와도 같은 숫자가 되게 한다.
  const toRow = (c: CandidateMovie, posterUrl: string | null, genreAlt: string | null, reason?: string): RowMovie => {
    const { genre, allGenres } = genreFields(genreAlt);
    const affinity = scoreAffinityWithCf(c.taste, taste.ctx, c.quality, c.movieCd, cf);
    const recommendScore = affinity?.score ?? null;
    return {
      // 숫자 KOBIS 코드만 "kobis-"를 붙인다 — 예전엔 tmdb-*·wikidata-* 영화에도 붙여
      // "kobis-tmdb-123" 같은 ID가 되어 평점이 다른 행의 같은 영화와 따로 저장됐다.
      id: cdToMovieId(c.movieCd),
      title: c.title,
      posterUrl,
      gradient: FALLBACK_GRADIENT_VAL,
      isNowShowing: false,
      genre,
      allGenres,
      ...(recommendScore !== null ? { recommendScore } : {}),
      ...(affinity?.cfBlended ? { recommendCf: true } : {}),
      ...(reason ? { recommendReason: reason } : {}),
    };
  };
  const isShowable = (r: RowMovie) => r.posterUrl !== null && !isAdultContent({ title: r.title, genreAlt: r.allGenres });

  const results: RowMovie[] = final
    .map(({ candidate: c, reason }) => {
      const meta = metas.get(c.movieCd);
      return toRow(c, meta?.posterUrl ?? c.posterUrl, meta?.genreAlt ?? c.genreAlt, reason);
    })
    .filter(isShowable);

  // Fallback fill: MMR 다양성 제약 또는 포스터 없는 영화 제거로 목표 편수 미만이 되면
  // 후보 풀 밖의 최신 영화로 채운다.
  if (results.length < target) {
    const needed = target - results.length;
    const excludeMovieCds = new Set(candidates.map((c) => c.movieCd));
    const fallback = await fetchFallbackCandidates(isRated, excludeMovieCds, needed, keywords);
    if (fallback.length > 0) {
      const [fallbackMetas] = await Promise.all([
        getCachedMovieMetas(fallback.map((c) => c.movieCd)),
        cf?.prefetch(fallback.map((c) => c.movieCd)),
      ]);
      for (const c of fallback) {
        const meta = fallbackMetas.get(c.movieCd);
        const row = toRow(c, meta?.posterUrl ?? c.posterUrl, meta?.genreAlt ?? c.genreAlt);
        if (!isShowable(row)) continue;
        results.push(row);
        if (results.length >= target) break;
      }
    }
  }

  // 화면엔 추천도(%) 높은 순으로 보여준다 — 순위 점수와 배지 숫자가 따로 놀면 "추천 72%"
  // 다음에 "추천 91%"가 오는 식으로 순서가 뒤죽박죽으로 보였다. (고르는 것은 위의 순위 점수,
  // 보여주는 순서만 추천도. 동점이면 순위 점수 순서를 유지한다.)
  if (taste.ctx.hasData) {
    results.sort((a, b) => (b.recommendScore ?? 0) - (a.recommendScore ?? 0));
  }

  // 다른 행의 카드처럼 사이트 평점(한줄평·장문평 평균과 평가 인원)을 붙인다.
  const cdOf = (r: RowMovie) => movieIdToCd(r.id) ?? r.id;
  const avgMap = await getBulkMovieRatingAverages(results.map(cdOf));
  return {
    results: results.map((r) => {
      const avgs = avgMap.get(cdOf(r));
      return { ...r, shortAvg: avgs?.shortAvg ?? null, shortCount: avgs?.shortCount ?? null, longAvg: avgs?.longAvg ?? null };
    }),
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ results: [] });
  }
  // 입력은 브라우저 localStorage에서 온 값이라 형식·범위를 검증한다(rating-input.ts).
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const myRatings = sanitizeRatings(input.myRatings);
  const myCategoryRatings = sanitizeCategoryRatings(input.myCategoryRatings);
  const genre = typeof input.genre === "string" && Object.hasOwn(GENRE_KEYWORDS, input.genre) ? input.genre : null;
  const keywords = genre ? GENRE_KEYWORDS[genre] : null;
  const requestedLimit = typeof input.limit === "number" && Number.isFinite(input.limit) ? input.limit : 10;
  const target = Math.min(20, Math.max(1, Math.floor(requestedLimit)));

  // 동일 입력에 대한 2분 캐시 히트 → 즉시 반환
  const cacheKey = `${hashInput(myRatings, myCategoryRatings)}|${genre ?? ""}|${target}`;
  const cached = recServerCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  let payload: { results: RowMovie[] };
  try {
    payload = await buildRecommendations(myRatings, myCategoryRatings, keywords, target, cacheKey);
  } catch (error) {
    console.warn("[recommendations] 추천 계산 실패:", error);
    return NextResponse.json({ results: [] });
  }

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
