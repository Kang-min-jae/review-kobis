// 협업 필터링(CF) 설정 — 환경변수와 코드 상수를 한곳에 모은다.
//
// 기본값 그대로(CF_ENABLED 미설정)면 CF는 완전히 꺼져 있고, "추천 N%"는 예전과 똑같이 계산된다.
// 숫자 환경변수가 잘못된 값이면 기본값으로 대신하고 서버 로그에 한 번 경고를 남긴다.
// 각 값의 의미는 README의 "협업 필터링(CF) 환경변수" 표 참고.

import type { CfConfig } from "./cf-core";

type NumberSpec = { env: string; fallback: number; min: number; max: number; integer: boolean };

const SPECS = {
  minTotalRatings: { env: "CF_MIN_TOTAL_RATINGS", fallback: 2000, min: 0, max: 1e9, integer: true },
  minUsers: { env: "CF_MIN_USERS", fallback: 200, min: 0, max: 1e9, integer: true },
  minCoRaters: { env: "CF_MIN_CO_RATERS", fallback: 5, min: 2, max: 1e6, integer: true },
  shrinkage: { env: "CF_SHRINKAGE", fallback: 10, min: 0, max: 1e6, integer: false },
  alphaMax: { env: "CF_ALPHA_MAX", fallback: 0.6, min: 0, max: 1, integer: false },
  neighborsK: { env: "CF_NEIGHBORS_K", fallback: 50, min: 1, max: 1000, integer: true },
  minUserRatings: { env: "CF_MIN_USER_RATINGS", fallback: 5, min: 1, max: 1e6, integer: true },
  fullUserRatings: { env: "CF_FULL_USER_RATINGS", fallback: 30, min: 1, max: 1e6, integer: true },
  fullNeighbors: { env: "CF_FULL_NEIGHBORS", fallback: 10, min: 1, max: 1e6, integer: true },
} satisfies Record<string, NumberSpec>;

type NumberKey = keyof typeof SPECS;

// 유사도가 이보다 작은 쌍은 노이즈로 보고 버린다(축소 후 값 기준).
export const CF_MIN_SIMILARITY = 0.1;
// 평가자가 이보다 적은 영화는 유사도 계산에서 뺀다 — 어차피 공동 평가자 기준을 못 넘고 계산만 무거워진다.
export const CF_MIN_MOVIE_RATERS = 5;
// 예측에 쓴 이웃 유사도 합이 이보다 작으면 근거가 너무 약해 CF를 쓰지 않는다(B = null).
export const CF_MIN_SIMILARITY_SUM = 0.2;
// 크론 한 묶음에서 계산할 영화 수와, 한 번 실행에서 CF 계산에 쓸 시간(서버리스 함수 제한 60초 안).
export const CF_BATCH_SIZE = 200;
export const CF_TIME_BUDGET_MS = 40_000;
// 요청 시 읽는 값(전역 게이트 통계, 영화별 이웃 목록)의 서버 캐시 시간.
export const CF_CACHE_TTL_MS = 10 * 60 * 1000;

const warned = new Set<string>();

function readNumber(spec: NumberSpec): number {
  const raw = process.env[spec.env];
  if (raw === undefined || raw.trim() === "") return spec.fallback;
  const value = Number(raw);
  const valid =
    Number.isFinite(value) && value >= spec.min && value <= spec.max && (!spec.integer || Number.isInteger(value));
  if (valid) return value;
  if (!warned.has(spec.env)) {
    warned.add(spec.env);
    console.warn(`[cf-config] ${spec.env}="${raw}" 값이 올바르지 않아 기본값 ${spec.fallback}을 씁니다.`);
  }
  return spec.fallback;
}

export function getCfConfig(): CfConfig {
  const numbers = Object.fromEntries(
    (Object.keys(SPECS) as NumberKey[]).map((key) => [key, readNumber(SPECS[key])]),
  ) as Record<NumberKey, number>;
  return {
    enabled: process.env.CF_ENABLED === "true",
    ...numbers,
    minSimilarity: CF_MIN_SIMILARITY,
    minSimilaritySum: CF_MIN_SIMILARITY_SUM,
  };
}
