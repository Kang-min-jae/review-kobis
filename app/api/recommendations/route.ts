import { NextResponse } from "next/server";
import { db } from "../../_lib/db";
import { getMovieMetas } from "../../_lib/movie-rate-info";
import { genreFields, splitGenres } from "../../_lib/movie-rows";
import type { RowMovie } from "../../_lib/movie-rows";

const FALLBACK_GRADIENT_VAL = "from-neutral-800 via-neutral-600 to-neutral-400";

// 동일 입력(평점 데이터)에 대한 반복 요청을 2분간 캐싱 — React StrictMode 이중 호출,
// 빠른 페이지 재진입 등으로 발생하는 중복 요청을 서버에서 흡수한다.
const recServerCache = new Map<string, { data: { results: RowMovie[] }; expiresAt: number }>();
const REC_CACHE_TTL = 2 * 60 * 1000; // 2분
const REC_CACHE_MAX = 200;

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
};

type UserProfile = {
  // 채널 검색용 리스트 (기존 유지)
  topGenres: string[];
  topDirectors: string[];
  topActors: string[];
  avoidedGenres: string[];
  avoidedDirectors: string[];
  categoryWeights: Record<string, number>; // 0-1, 카테고리별 사용자 선호 강도
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
  categoryRatings: Record<string, number>; // category → avg rating (0-10), 5건 이상 집계된 항목만
  categoryDataCount: number;               // 5건 이상 집계된 항목 수
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
// 2. Build user profile (벡터 포함)
// ─────────────────────────────────────────────────────

async function buildUserProfile(
  ratings: IncomingRating[],
  categoryRatings: IncomingCategoryRating[]
): Promise<UserProfile> {
  const empty: UserProfile = {
    topGenres: [], topDirectors: [], topActors: [],
    avoidedGenres: [], avoidedDirectors: [],
    categoryWeights: {}, coldStart: true,
    genreVec: {}, directorVec: {}, actorVec: {},
    avoidedGenreVec: {}, avoidedDirectorVec: {},
  };
  if (ratings.length === 0) return empty;

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

  const catSum = new Map<string, { sum: number; count: number }>();
  for (const cr of categoryRatings) {
    if (cr.category === "전체") continue;
    const entry = catSum.get(cr.category) ?? { sum: 0, count: 0 };
    entry.sum += cr.value;
    entry.count += 1;
    catSum.set(cr.category, entry);
  }
  const categoryWeights: Record<string, number> = {};
  for (const [cat, { sum, count }] of catSum) {
    categoryWeights[cat] = sum / count / 10; // 0-1 정규화
  }

  return {
    topGenres, topDirectors, topActors, avoidedGenres, avoidedDirectors,
    categoryWeights, coldStart: false,
    genreVec, directorVec, actorVec, avoidedGenreVec, avoidedDirectorVec,
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
    categoryRatings: {},
    categoryDataCount: 0,
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
    where: { posterUrl: { not: null }, OR: conditions },
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
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements("cast"::jsonb) AS elem
        WHERE elem->>'name' = ANY(${topActors})
      )
    LIMIT 100
  `;
  return rows.filter((m) => !ratedMovieIds.has(`kobis-${m.movieCd}`) && !ratedMovieIds.has(`tmdb-${m.tmdbId}`)).slice(0, 60);
}

// Channel 2: 항목별 선호 특화
async function fetchByCategory(profile: UserProfile, ratedMovieIds: Set<string>): Promise<DbMovie[]> {
  const cw = profile.categoryWeights;
  const maxEntry = Object.entries(cw).sort((a, b) => b[1] - a[1])[0];
  if (!maxEntry || maxEntry[1] < 0.5) return [];

  const genreMap: Record<string, string[]> = {
    "연출": ["드라마", "스릴러", "SF", "범죄"],
    "편집": ["액션", "스릴러", "SF"],
    "각본": ["드라마", "미스터리", "스릴러"],
    "음악": ["뮤지컬", "애니메이션"],
    "연기": ["드라마", "멜로/로맨스"],
  };
  const targetGenres = genreMap[maxEntry[0]] ?? ["드라마"];

  const rows = await db.cachedMovie.findMany({
    where: { posterUrl: { not: null }, OR: targetGenres.map((g) => ({ genreAlt: { contains: g } })) },
    orderBy: { updatedAt: "desc" },
    take: 80,
    select: { movieCd: true, tmdbId: true, title: true, posterUrl: true, genreAlt: true, directorName: true, cast: true },
  });
  return rows.filter((m) => !ratedMovieIds.has(`kobis-${m.movieCd}`) && !ratedMovieIds.has(`tmdb-${m.tmdbId}`)).slice(0, 60);
}

// Channel 3: 최근 2년 최신작
async function fetchTrending(ratedMovieIds: Set<string>): Promise<DbMovie[]> {
  const twoYearsAgo = new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = await db.cachedMovie.findMany({
    where: { posterUrl: { not: null }, releaseDate: { gte: twoYearsAgo } },
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
  categoryRatings: Record<string, number>;
  categoryDataCount: number;
};

async function fetchCandidateReviews(movieCds: string[]): Promise<Map<string, ReviewAggEntry>> {
  if (movieCds.length === 0) return new Map();

  const groups = await db.review.groupBy({
    by: ["movieCd", "category"],
    where: { movieCd: { in: movieCds }, type: "SHORT" },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const result = new Map<string, ReviewAggEntry>();
  for (const g of groups) {
    if (!result.has(g.movieCd)) {
      result.set(g.movieCd, { reviewAvg: null, reviewCount: 0, categoryRatings: {}, categoryDataCount: 0 });
    }
    const entry = result.get(g.movieCd)!;
    if (g.category === "전체") {
      entry.reviewAvg = g._avg.rating;
      entry.reviewCount = g._count._all;
    } else if (g._count._all >= 5 && g._avg.rating !== null) {
      // 항목별 집계는 5건 이상 확보된 것만 신뢰
      entry.categoryRatings[g.category] = g._avg.rating;
    }
  }
  // 신뢰 가능한 항목 수 집계
  for (const entry of result.values()) {
    entry.categoryDataCount = Object.keys(entry.categoryRatings).length;
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

// 항목별 친화도 점수 — 사용자가 중시하는 항목에서 해당 영화가 좋은 평가를 받을수록 높아짐.
// 모든 카테고리에서 5건 이상 집계된 데이터가 없으면 null(점수 제외) 반환.
function calculateCategoryMatchScore(
  userCategoryWeights: Record<string, number>,
  movie: CandidateMovie
): number | null {
  if (movie.categoryDataCount < 5) return null;
  const categories = ["연출", "연기", "각본", "음악", "편집"];
  let score = 0;
  for (const cat of categories) {
    score += (userCategoryWeights[cat] ?? 0.2) * ((movie.categoryRatings[cat] ?? 7.0) / 10);
  }
  return score / categories.length; // 0-1 정규화
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

  // 항목별 친화도 점수 (데이터 부족 시 null → 가중치 재분배)
  const categoryScore = calculateCategoryMatchScore(profile.categoryWeights, movie);

  let totalScore: number;
  if (categoryScore === null) {
    totalScore = 0.55 * userSimScore + 0.45 * qualityScore;
  } else {
    totalScore = 0.40 * userSimScore + 0.30 * categoryScore + 0.30 * qualityScore;
  }

  // 평점 페널티: 플랫폼 리뷰 평균이 낮으면 취향 유사도가 높아도 최종 점수를 끌어내린다.
  const ratingFactor = getRatingPenaltyFactor(movie.reviewAvg, movie.reviewCount);
  return Math.max(0, Math.min(1, (totalScore - negativePenalty) * ratingFactor));
}

async function getCandidates(profile: UserProfile, ratedMovieIds: Set<string>): Promise<CandidateMovie[]> {
  // Cold start: 최신 영화 20편 반환 + 품질 점수 계산
  if (profile.coldStart) {
    const recent = await db.cachedMovie.findMany({
      where: { posterUrl: { not: null }, releaseDate: { gte: new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) } },
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

  // 4채널 병렬 조회 후 union (중복 제거)
  const [genreDirectorRows, actorRows, categoryRows, trendingRows] = await Promise.all([
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
      candidate.categoryRatings = rev.categoryRatings;
      candidate.categoryDataCount = rev.categoryDataCount;
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
    if (topN.length >= 20) break;
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
    .map(([cat, w]) => `${cat}: ${w >= 0.7 ? "매우 중시" : w >= 0.5 ? "중시" : "비중 낮음"}`)
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
    categoryRatings: Object.keys(c.categoryRatings).length > 0
      ? Object.fromEntries(Object.entries(c.categoryRatings).map(([k, v]) => [k, Math.round(v * 10) / 10]))
      : null,
  }));

  const systemPrompt = `당신은 영화 추천 알고리즘의 최종 리랭킹 엔진입니다.
1차 정량 스코어(quantScore, 0~100)를 참고하되 아래 규칙에 따라 조정하세요.

[Scoring Rules]
1. Absolute Quality Rule: averageRating이 8.5 이상이고 reviewCount가 20 이상인 검증된 명작은 최종 score가 75 미만으로 떨어지지 않아야 한다. reviewCount가 20 미만이면 소표본이므로 예외로 하고 quantScore를 그대로 신뢰하라.
2. Category Rating Weight Rule: 사용자의 항목별 선호도(categoryWeights)를 반영해, 해당 항목 평점이 높은 영화에 가점을 주라. categoryRatings가 null인 영화는 이 규칙을 건너뛰라.
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
): Promise<CandidateMovie[]> {
  const rows = await db.cachedMovie.findMany({
    where: { posterUrl: { not: null } },
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
  limit: number
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
    if (item.candidate.allGenres.some((g) => (genreCount.get(g) ?? 0) >= genreCap)) continue;

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

  // 동일 입력에 대한 2분 캐시 히트 → 즉시 반환
  const cacheKey = hashBody(myRatings, myCategoryRatings);
  const cached = recServerCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  const ratedMovieIds = new Set(myRatings.map((r) => r.movieId));

  const profile = await buildUserProfile(myRatings, myCategoryRatings);
  const candidates = await getCandidates(profile, ratedMovieIds);

  if (candidates.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const movieCds = candidates.map((c) => c.movieCd);
  const llmTimeout = new Promise<LlmResult>((resolve) => setTimeout(() => resolve([]), 400));
  const [llmResults, metas] = await Promise.all([
    Promise.race([callLlm(profile, candidates), llmTimeout]).catch(() => [] as LlmResult),
    getMovieMetas(movieCds),
  ]);

  const llmMap = new Map(llmResults.map((r) => [r.movieCd, r]));
  const final = blendAndMMR(candidates, llmMap, 10);

  const buildRowMovie = (
    c: CandidateMovie,
    posterUrl: string | null,
    genreAlt: string | null,
    finalScore: number,
    reason?: string,
  ): RowMovie => {
    const { genre, allGenres } = genreFields(genreAlt);
    return {
      id: `kobis-${c.movieCd}`,
      title: c.title,
      posterUrl,
      gradient: FALLBACK_GRADIENT_VAL,
      isNowShowing: false,
      genre,
      allGenres,
      recommendScore: Math.min(99, Math.max(1, Math.round(100 * finalScore))),
      recommendReason: reason,
    };
  };

  const results: RowMovie[] = final
    .map(({ candidate: c, finalScore, reason }) => {
      const meta = metas.get(c.movieCd);
      return buildRowMovie(c, meta?.posterUrl ?? c.posterUrl, meta?.genreAlt ?? c.genreAlt, finalScore, reason ?? undefined);
    })
    .filter((r) => r.posterUrl !== null);

  // Fallback fill: MMR 다양성 제약 또는 포스터 없는 영화 제거로 10편 미만이 되면
  // 후보 풀 밖의 최신 영화로 채운다.
  const TARGET = 10;
  if (results.length < TARGET) {
    const needed = TARGET - results.length;
    const excludeMovieCds = new Set(candidates.map((c) => c.movieCd));
    const fallback = await fetchFallbackCandidates(ratedMovieIds, excludeMovieCds, needed);
    if (fallback.length > 0) {
      const fallbackMetas = await getMovieMetas(fallback.map((c) => c.movieCd));
      for (const c of fallback) {
        const meta = fallbackMetas.get(c.movieCd);
        const posterUrl = meta?.posterUrl ?? c.posterUrl;
        if (!posterUrl) continue;
        results.push(buildRowMovie(c, posterUrl, meta?.genreAlt ?? c.genreAlt, c.totalScore));
        if (results.length >= TARGET) break;
      }
    }
  }

  const payload = { results };

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
