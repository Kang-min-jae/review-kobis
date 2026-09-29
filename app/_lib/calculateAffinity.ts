// 추천도(%) 계산 공통 모듈 — /api/affinity(모든 카드의 "추천 N%" 배지)와
// /api/recommendations(추천 영화·시리즈 행)가 같은 공식과 같은 재료를 쓴다.
// 그래서 같은 사용자·같은 영화면 어느 행에서 보든 같은 숫자가 나온다.
//
// 추천도 = 취향 적합도(장르·감독·배우) + 커뮤니티 품질(베이지안 보정 평점) + 항목 궁합 보정
//  · 취향 적합도: 그 장르·감독·배우의 영화들에 내가 준 평균 평점을 "내 최고 선호" 대비
//    비율로 본다. 최근 평가일수록 크게 반영하고, 평가 수가 적으면 내 전체 평균 쪽으로 당긴다.
//    평가 기록이 없는 장르는 "내 평균 취향"으로 본다(싫어한 장르 < 처음 보는 장르 < 좋아한 장르).
//  · 품질: 사이트 평균 평점을 리뷰 수로 보정한다(적을수록 6.5점 쪽으로).
//  · 항목 궁합: 내가 중시하는 항목(연출·연기·각본·음악·편집)에서 그 영화가 상대적으로
//    강하면 조금 올리고, 약하면 조금 내린다(최대 ±10%p).

import { CATEGORY_KEYS, type CategoryRatingInput, type RatingInput } from "./rating-input";

export interface RatedMovieForContext {
  rating: number; // 0–10 ("전체" 평점)
  weight?: number; // 최근성 가중치(0–1], 없으면 1
  genres: string[]; // 대표 장르(genre-canon.ts의 canonicalGenres 결과)
  directorName: string | null;
  castNames: string[]; // 상위 5명
}

export interface AffinityContext {
  hasData: boolean; // 메타(장르·감독·배우)를 확인한 평가가 하나라도 있나
  userMean: number; // 내 평균 평점 (0–10, 평가가 적으면 7점 쪽으로 보정)
  genrePref: Map<string, number>; // 장르 → 보정된 내 평균 평점 (0–10)
  directorPref: Map<string, number>;
  actorPref: Map<string, number>;
  genreScale: number; // 정규화 기준 = max(최고 선호 평균, PREF_SCALE_FLOOR)
  directorScale: number;
  actorScale: number;
  categoryWeights: Record<string, number>; // 항목별 선호 비중(합계 1), 항목 평점이 없으면 {}
}

// 평가 1~2건짜리 장르·감독·배우가 우연한 점수 하나로 과대/과소평가되지 않게, 내 전체
// 평균 점수를 이만큼(가상 평가 수) 섞는다.
const PREF_SHRINK_K = 1;
// 내 전체 평균도 평가가 몇 편 안 될 때 한두 편의 점수로 극단적이 되지 않게 7점 쪽으로 당긴다
// (예: 3점 한 편만 남긴 사용자의 모든 영화가 낮은 추천도로 나오지 않게).
const USER_PRIOR_MEAN = 7;
const USER_PRIOR_K = 2;
// 정규화 기준의 하한. 예전엔 "내 최고 선호 평균"으로만 나눠서, 3점을 준 드라마 한 편이
// 유일한 기록이면 드라마가 최고 선호(3/3 = 100%)가 되어 드라마 영화마다 높은 추천도가 나왔다.
const PREF_SCALE_FLOOR = 8;

type Agg = Map<string, { sum: number; weight: number }>;

function addTo(agg: Agg, key: string, rating: number, weight: number) {
  const entry = agg.get(key) ?? { sum: 0, weight: 0 };
  entry.sum += rating * weight;
  entry.weight += weight;
  agg.set(key, entry);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function buildAffinityContext(
  ratedMovies: RatedMovieForContext[],
  categoryWeights: Record<string, number> = {},
): AffinityContext {
  const genreAgg: Agg = new Map();
  const directorAgg: Agg = new Map();
  const actorAgg: Agg = new Map();
  let totalSum = 0;
  let totalWeight = 0;

  for (const movie of ratedMovies) {
    const weight = movie.weight ?? 1;
    if (!(weight > 0) || !Number.isFinite(movie.rating)) continue;
    totalSum += movie.rating * weight;
    totalWeight += weight;
    for (const genre of new Set(movie.genres)) addTo(genreAgg, genre, movie.rating, weight);
    if (movie.directorName) addTo(directorAgg, movie.directorName, movie.rating, weight);
    for (const name of new Set(movie.castNames.slice(0, 5))) addTo(actorAgg, name, movie.rating, weight);
  }

  const userMean = (totalSum + USER_PRIOR_K * USER_PRIOR_MEAN) / (totalWeight + USER_PRIOR_K);
  const toPref = (agg: Agg) =>
    new Map([...agg].map(([key, { sum, weight }]) => [key, (sum + PREF_SHRINK_K * userMean) / (weight + PREF_SHRINK_K)]));
  const scaleOf = (pref: Map<string, number>) => {
    let max = PREF_SCALE_FLOOR;
    for (const value of pref.values()) if (value > max) max = value;
    return max;
  };

  const genrePref = toPref(genreAgg);
  const directorPref = toPref(directorAgg);
  const actorPref = toPref(actorAgg);

  return {
    hasData: totalWeight > 0,
    userMean,
    genrePref,
    directorPref,
    actorPref,
    genreScale: scaleOf(genrePref),
    directorScale: scaleOf(directorPref),
    actorScale: scaleOf(actorPref),
    categoryWeights,
  };
}

// 커뮤니티 평균 평점 → 베이지안 보정 품질 점수 (0–1).
// 리뷰 수가 적을수록 사전 확률(6.5/10)로 끌어당겨 소표본 왜곡을 방지한다.
const BAYES_C = 20;
const BAYES_PRIOR = 6.5;

export function computeBayesianQuality(reviewAvg: number | null, reviewCount: number): number {
  if (reviewCount >= 1 && reviewAvg !== null && Number.isFinite(reviewAvg)) {
    return (reviewCount * reviewAvg + BAYES_C * BAYES_PRIOR) / (reviewCount + BAYES_C) / 10;
  }
  return BAYES_PRIOR / 10;
}

// 영화 한 편의 추천도(0–1).
// 신호 유무는 "매칭되는 기록이 있는가"로 판단한다 — 예전엔 점수가 0보다 큰지로 판단해서,
// 0점을 준 장르는 "기록 없음"으로 취급돼 1점을 준 장르보다 오히려 추천도가 높게 나왔다.
export function calculateMovieAffinity(
  movie: { genres: string[]; directorName?: string | null; castNames?: string[] },
  ctx: AffinityContext,
  bayesianQuality: number, // 0–1
  categoryBoost = 0, // calculateCategoryBoost 결과(±0.1)
): number {
  // 1. 장르: 장르별 선호를 평균한다. 평가 기록이 없는 장르는 "내 평균 취향"으로 본다 —
  //    예전엔 기록 없는 장르만 가진 영화를 품질 점수만으로 계산해서, 처음 보는 장르와
  //    싫어하는 장르가 같은 추천도(65% 안팎)로 나왔다. 이제 싫어한 장르 < 처음 보는 장르 <
  //    좋아한 장르 순서가 되고, "좋아하는 장르 + 처음 보는 장르"는 "좋아하는 장르만"보다 조금 낮다.
  const genres = [...new Set(movie.genres)];
  let genreScore: number | null = null;
  if (genres.length > 0) {
    const avg = genres.reduce((sum, g) => sum + (ctx.genrePref.get(g) ?? ctx.userMean), 0) / genres.length;
    genreScore = clamp01(avg / ctx.genreScale);
  }

  // 2. 감독: 이 감독의 영화들에 준 평균 평점
  const directorPref = movie.directorName ? ctx.directorPref.get(movie.directorName) : undefined;
  const directorScore = directorPref !== undefined ? clamp01(directorPref / ctx.directorScale) : null;

  // 3. 배우: 출연진 중 가장 선호하는 배우
  let actorScore: number | null = null;
  for (const name of (movie.castNames ?? []).slice(0, 5)) {
    const pref = ctx.actorPref.get(name);
    if (pref !== undefined) actorScore = Math.max(actorScore ?? 0, clamp01(pref / ctx.actorScale));
  }

  // 감독(60%)+배우(40%) 합산 인물 점수
  const personScore =
    directorScore !== null && actorScore !== null
      ? 0.6 * directorScore + 0.4 * actorScore
      : directorScore ?? actorScore;

  // 4. 가중합 — 신호가 있는 요소만 반영
  let base: number;
  if (genreScore !== null && personScore !== null) {
    base = 0.4 * genreScore + 0.2 * personScore + 0.4 * bayesianQuality; // 장르 40% + 인물 20% + 품질 40%
  } else if (genreScore !== null) {
    base = 0.6 * genreScore + 0.4 * bayesianQuality;
  } else if (personScore !== null) {
    base = 0.6 * personScore + 0.4 * bayesianQuality;
  } else {
    base = bayesianQuality;
  }
  return clamp01(base + categoryBoost);
}

// 0–1 추천도 → 화면의 "추천 N%" (1~99)
export function affinityPercent(raw: number): number {
  return Math.min(99, Math.max(1, Math.round(raw * 100)));
}

// ── 최근성 ─────────────────────────────────────────────────────────────

// 평가 개수가 적을수록 반감기를 길게 — 프로필이 급격히 흔들리지 않게.
function halfLifeDays(totalCount: number): number {
  return totalCount < 10 ? 180 : totalCount < 30 ? 120 : 90;
}

// 0–1. 날짜가 없거나 잘못됐으면 1, 미래 날짜(기기 시계 오차)도 1로 본다 — 예전엔 미래
// 날짜면 가중치가 1을 넘어 그 평가 하나가 과하게 반영됐다.
export function recencyDecay(ratedAt: string | null, totalCount: number, now = Date.now()): number {
  if (!ratedAt) return 1;
  const time = Date.parse(ratedAt);
  if (Number.isNaN(time)) return 1;
  const days = Math.max(0, (now - time) / 86400000);
  return Math.pow(0.5, days / halfLifeDays(totalCount));
}

// 추천도 배지용 — 오래된 평가도 여전히 취향 정보라 1/4 아래로는 줄이지 않는다.
export function recencyWeight(ratedAt: string | null, totalCount: number): number {
  return Math.max(0.25, recencyDecay(ratedAt, totalCount));
}

// ── 항목별 선호 비중 ───────────────────────────────────────────────────

// 사용자가 어떤 항목을 중시하는지 — 두 신호를 곱해 비중(합계 1)으로 만든다.
//  · 빈도: 그 항목에 평점을 얼마나 자주 남겼나 (연출에 유독 많이 남김 → 연출 비중↑)
//  · 상대 점수: 그 항목에 준 평균이 내 항목 평균보다 얼마나 높은가
//    (음악을 다른 항목보다 높게 줌 → 음악 비중↑, 1점 높을 때마다 ×1.2, 0.5~1.5배로 제한)
// "전체" 평점을 높게(7점 이상) 준 영화에서 남긴 항목 점수는 취향을 더 잘 드러내므로
// 그렇지 않은 영화의 항목 점수보다 2배로 반영한다.
export function buildCategoryWeights(
  ratings: RatingInput[],
  categoryRatings: CategoryRatingInput[],
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

// 항목 궁합 보정 — 영화의 항목별 평점에서 "그 영화 안에서 상대적으로 강한 항목"을 찾고,
// 그 항목을 내가 중시할수록 점수를 조금 올린다(약한 항목이면 조금 내린다).
//  · 상대 강점 = 항목 평균 − 그 영화의 항목 평균 전체 (점 단위, 보통 -2~+2)
//    평가가 적은 항목은 영화 평균 쪽으로 끌어당겨(K건 가상 평가) 1~2명 평가에 휘둘리지 않게 한다.
//  · 보정 = Σ(내 항목 비중 × 상대 강점) / 2 → -1~1로 자른 뒤 × CATEGORY_BOOST_MAX
// 두 개 이상 항목에 평가가 있어야 "다른 항목보다 높다"를 판단할 수 있다.
const CATEGORY_BOOST_MAX = 0.1;
const CATEGORY_SHRINK_K = 3;

export function calculateCategoryBoost(
  userCategoryWeights: Record<string, number>,
  categoryStats: Record<string, { avg: number; count: number }>,
): number {
  const stats = Object.values(categoryStats);
  if (Object.keys(userCategoryWeights).length === 0 || stats.length < 2) return 0;
  const totalCount = stats.reduce((sum, s) => sum + s.count, 0);
  if (totalCount === 0) return 0;
  const movieMean = stats.reduce((sum, s) => sum + s.avg * s.count, 0) / totalCount;

  let affinity = 0;
  for (const [cat, weight] of Object.entries(userCategoryWeights)) {
    const s = categoryStats[cat];
    if (!s) continue;
    const shrunk = (s.count * s.avg + CATEGORY_SHRINK_K * movieMean) / (s.count + CATEGORY_SHRINK_K);
    affinity += weight * (shrunk - movieMean);
  }
  return Math.max(-1, Math.min(1, affinity / 2)) * CATEGORY_BOOST_MAX;
}
