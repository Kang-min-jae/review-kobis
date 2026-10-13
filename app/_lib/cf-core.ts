// 협업 필터링(CF) 계산식 — DB·환경변수에 의존하지 않는 순수 함수만 둔다(단위 테스트·오프라인 검증에서 그대로 쓴다).
//
//  · 전역 게이트: CF_ENABLED + 사이트 전체 평점 수 + 평점 남긴 사용자 수가 모두 기준 이상일 때만 CF를 켠다.
//  · 영화 간 유사도: 사용자 평균을 뺀 평점(r_ui − mean_u)으로 계산한 아이템 기반 코사인 유사도.
//    공동 평가자 n이 기준 미만인 쌍은 버리고, sim' = sim × n / (n + λ)로 줄여 우연한 일치를 누른다.
//  · CF 점수 B: 내가 평가한 이웃 영화들의 (내 평점 − 내 평균)을 유사도로 가중 평균해 내 평균에 더한다.
//  · 최종 = (1 − α) × A + α × B — α는 내 평점 수와 유효 이웃 수가 많을수록 커진다(최대 CF_ALPHA_MAX).
// 점수는 모두 0~1(= 추천 0~100%) 척도로 섞는다. A(calculateMovieAffinity)가 사이트 평점을 /10 해서 쓰는 것과
// 같은 변환으로, 예측 평점(0~10)은 /10 한다.

export type CfConfig = {
  enabled: boolean; // CF_ENABLED === "true"
  minTotalRatings: number;
  minUsers: number;
  minCoRaters: number;
  shrinkage: number; // λ
  alphaMax: number;
  neighborsK: number;
  minUserRatings: number;
  fullUserRatings: number;
  fullNeighbors: number;
  minSimilarity: number; // 축소 후 이 값 미만인 쌍은 버린다
  minSimilaritySum: number; // 예측에 쓴 이웃 유사도 합이 이보다 작으면 B = null
};

export type CfGlobalStats = { totalRatings: number; ratingUsers: number };

export type CfNeighbor = { cd: string; sim: number; coRaters: number };

export type CfRating = { userId: string; movieCd: string; score: number };

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// 전역 게이트 — 하나라도 못 맞추거나 통계가 아직 없으면(null) 꺼짐.
export function isCfGateOpen(config: CfConfig, stats: CfGlobalStats | null): boolean {
  if (!config.enabled || !stats) return false;
  return stats.totalRatings >= config.minTotalRatings && stats.ratingUsers >= config.minUsers;
}

// 공동 평가자 수가 기준 이상인 쌍만 유사도에 쓴다.
export function hasEnoughCoRaters(coRaters: number, config: Pick<CfConfig, "minCoRaters">): boolean {
  return coRaters >= config.minCoRaters;
}

// 축소(shrinkage): 공동 평가자가 적을수록 0에 가깝게.
export function shrinkSimilarity(sim: number, coRaters: number, lambda: number): number {
  if (coRaters <= 0) return 0;
  return (sim * coRaters) / (coRaters + lambda);
}

// 평점 목록 → 영화별 이웃(유사도 내림차순, 영화당 최대 neighborsK개).
// 크론의 SQL(cf-similarity-compute.ts)과 같은 식이다 — 오프라인 검증과 테스트에서 쓴다.
export function computeItemSimilarities(
  ratings: CfRating[],
  config: Pick<CfConfig, "minCoRaters" | "shrinkage" | "minSimilarity" | "neighborsK">,
  minMovieRaters = 0,
): Map<string, CfNeighbor[]> {
  const raterCount = new Map<string, number>();
  for (const r of ratings) raterCount.set(r.movieCd, (raterCount.get(r.movieCd) ?? 0) + 1);

  // 사용자 평균은 그 사용자의 모든 평점으로 구한다.
  const byUser = new Map<string, { movieCd: string; score: number }[]>();
  for (const r of ratings) {
    const list = byUser.get(r.userId) ?? [];
    list.push({ movieCd: r.movieCd, score: r.score });
    byUser.set(r.userId, list);
  }

  type Acc = { dot: number; normA: number; normB: number; n: number };
  const pairs = new Map<string, Acc>();
  for (const list of byUser.values()) {
    const mean = list.reduce((sum, r) => sum + r.score, 0) / list.length;
    const centered = list
      .filter((r) => (raterCount.get(r.movieCd) ?? 0) >= minMovieRaters)
      .map((r) => ({ cd: r.movieCd, d: r.score - mean }))
      .sort((a, b) => (a.cd < b.cd ? -1 : a.cd > b.cd ? 1 : 0));
    for (let i = 0; i < centered.length; i++) {
      for (let j = i + 1; j < centered.length; j++) {
        const a = centered[i];
        const b = centered[j];
        const key = `${a.cd}\u0000${b.cd}`;
        const acc = pairs.get(key) ?? { dot: 0, normA: 0, normB: 0, n: 0 };
        acc.dot += a.d * b.d;
        acc.normA += a.d * a.d;
        acc.normB += b.d * b.d;
        acc.n += 1;
        pairs.set(key, acc);
      }
    }
  }

  const neighbors = new Map<string, CfNeighbor[]>();
  const push = (from: string, item: CfNeighbor) => {
    const list = neighbors.get(from) ?? [];
    list.push(item);
    neighbors.set(from, list);
  };
  for (const [key, acc] of pairs) {
    if (!hasEnoughCoRaters(acc.n, config)) continue;
    const denom = Math.sqrt(acc.normA * acc.normB);
    if (!(denom > 0)) continue;
    const sim = shrinkSimilarity(acc.dot / denom, acc.n, config.shrinkage);
    if (sim < config.minSimilarity) continue;
    const [a, b] = key.split("\u0000");
    push(a, { cd: b, sim, coRaters: acc.n });
    push(b, { cd: a, sim, coRaters: acc.n });
  }
  for (const [cd, list] of neighbors) {
    list.sort((x, y) => y.sim - x.sim || y.coRaters - x.coRaters || (x.cd < y.cd ? -1 : 1));
    neighbors.set(cd, list.slice(0, config.neighborsK));
  }
  return neighbors;
}

export function meanOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// CF 점수 B(0~1). 근거가 없으면(이웃 0개, 유사도 합이 너무 작음) null.
export function predictCf(
  myRatings: Map<string, number>, // movieCd → 내 평점(0~10)
  myMean: number,
  neighbors: CfNeighbor[] | undefined, // 대상 영화의 이웃(유사도 내림차순)
  config: Pick<CfConfig, "neighborsK" | "minSimilaritySum">,
): { score: number; neighborCount: number } | null {
  if (!neighbors || neighbors.length === 0) return null;
  const used = neighbors.filter((n) => myRatings.has(n.cd)).slice(0, config.neighborsK);
  if (used.length === 0) return null;
  let weighted = 0;
  let simSum = 0;
  for (const n of used) {
    weighted += n.sim * (myRatings.get(n.cd)! - myMean);
    simSum += Math.abs(n.sim);
  }
  if (simSum < config.minSimilaritySum) return null;
  const predicted = Math.min(10, Math.max(0, myMean + weighted / simSum));
  return { score: predicted / 10, neighborCount: used.length };
}

// CF 반영 비율 α.
export function computeAlpha(
  config: Pick<CfConfig, "alphaMax" | "minUserRatings" | "fullUserRatings" | "fullNeighbors">,
  input: { gateOpen: boolean; myRatingCount: number; neighborCount: number; hasCfScore: boolean },
): number {
  if (!input.gateOpen || !input.hasCfScore) return 0;
  if (input.myRatingCount < config.minUserRatings) return 0;
  const userFactor = Math.min(1, input.myRatingCount / config.fullUserRatings);
  const neighborFactor = Math.min(1, input.neighborCount / config.fullNeighbors);
  return clamp01(config.alphaMax * userFactor * neighborFactor);
}

// 최종 점수(0~1). B가 없거나 α가 0이면 A를 그대로 돌려준다(기존 결과와 완전히 같다).
export function blendScores(contentScore: number, cfScore: number | null, alpha: number): number {
  if (cfScore === null || !(alpha > 0)) return contentScore;
  return clamp01((1 - alpha) * contentScore + alpha * cfScore);
}
