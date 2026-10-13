// 협업 필터링(CF) 계산식 단위 테스트 — npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blendScores,
  computeAlpha,
  computeItemSimilarities,
  isCfGateOpen,
  predictCf,
  shrinkSimilarity,
  type CfConfig,
  type CfRating,
} from "../app/_lib/cf-core";

const config: CfConfig = {
  enabled: true,
  minTotalRatings: 2000,
  minUsers: 200,
  minCoRaters: 5,
  shrinkage: 10,
  alphaMax: 0.6,
  neighborsK: 50,
  minUserRatings: 5,
  fullUserRatings: 30,
  fullNeighbors: 10,
  minSimilarity: 0.1,
  minSimilaritySum: 0.2,
};

test("전역 게이트: CF_ENABLED가 아니거나 평점·사용자 수가 기준 미만이면 α = 0", () => {
  const enough = { totalRatings: 2000, ratingUsers: 200 };
  assert.equal(isCfGateOpen(config, enough), true);
  assert.equal(isCfGateOpen({ ...config, enabled: false }, enough), false);
  assert.equal(isCfGateOpen(config, { totalRatings: 1999, ratingUsers: 200 }), false);
  assert.equal(isCfGateOpen(config, { totalRatings: 2000, ratingUsers: 199 }), false);
  assert.equal(isCfGateOpen(config, null), false);

  for (const stats of [
    { totalRatings: 1999, ratingUsers: 500 },
    { totalRatings: 9999, ratingUsers: 199 },
  ]) {
    const alpha = computeAlpha(config, {
      gateOpen: isCfGateOpen(config, stats),
      myRatingCount: 30,
      neighborCount: 10,
      hasCfScore: true,
    });
    assert.equal(alpha, 0);
  }
  assert.equal(
    computeAlpha(config, {
      gateOpen: isCfGateOpen({ ...config, enabled: false }, { totalRatings: 9999, ratingUsers: 999 }),
      myRatingCount: 30,
      neighborCount: 10,
      hasCfScore: true,
    }),
    0,
  );
});

// 영화 A·B를 n명이 같은 방향으로 평가(취향이 같음) + 각자 평균을 만드는 다른 영화 2편.
function coRatedData(n: number): CfRating[] {
  const rows: CfRating[] = [];
  for (let u = 0; u < n; u++) {
    const high = u % 2 === 0;
    rows.push({ userId: `u${u}`, movieCd: "A", score: high ? 9 : 4 });
    rows.push({ userId: `u${u}`, movieCd: "B", score: high ? 9 : 4 });
    rows.push({ userId: `u${u}`, movieCd: "X", score: 6.5 });
    rows.push({ userId: `u${u}`, movieCd: "Y", score: 6.5 });
  }
  return rows;
}

test("공동 평가자 4명인 쌍은 유사도에 쓰이지 않고, 5명이면 쓰인다", () => {
  const four = computeItemSimilarities(coRatedData(4), config);
  assert.equal(four.get("A")?.some((n) => n.cd === "B") ?? false, false);
  const five = computeItemSimilarities(coRatedData(5), config);
  const ab = five.get("A")?.find((n) => n.cd === "B");
  assert.ok(ab, "5명이면 A-B 쌍이 있어야 한다");
  assert.equal(ab.coRaters, 5);
});

test("shrinkage: 공동 평가자가 적을수록 유사도가 작아진다", () => {
  assert.ok(shrinkSimilarity(1, 5, 10) < shrinkSimilarity(1, 20, 10));
  assert.ok(shrinkSimilarity(1, 20, 10) < shrinkSimilarity(1, 200, 10));
  assert.ok(Math.abs(shrinkSimilarity(0.8, 10, 10) - 0.4) < 1e-12);
  assert.equal(shrinkSimilarity(0.9, 0, 10), 0);
  // 계산된 유사도도 축소가 반영된다(완전히 같은 취향이어도 n=6이면 6/16)
  const sims = computeItemSimilarities(coRatedData(6), config);
  const ab = sims.get("A")!.find((n) => n.cd === "B")!;
  assert.ok(Math.abs(ab.sim - 6 / 16) < 1e-9);
});

test("α 계산: 내 평점 4개면 0, 30개 + 이웃 10개면 0.6", () => {
  assert.equal(computeAlpha(config, { gateOpen: true, myRatingCount: 4, neighborCount: 10, hasCfScore: true }), 0);
  assert.ok(
    Math.abs(computeAlpha(config, { gateOpen: true, myRatingCount: 30, neighborCount: 10, hasCfScore: true }) - 0.6) <
      1e-12,
  );
  // 중간값은 비례해서 줄어든다
  assert.ok(
    Math.abs(computeAlpha(config, { gateOpen: true, myRatingCount: 15, neighborCount: 5, hasCfScore: true }) - 0.15) <
      1e-12,
  );
  assert.equal(computeAlpha(config, { gateOpen: true, myRatingCount: 30, neighborCount: 10, hasCfScore: false }), 0);
});

test("B가 null이면 A만 반환한다", () => {
  assert.equal(blendScores(0.73, null, 0.6), 0.73);
  assert.equal(blendScores(0.73, 0.2, 0), 0.73);
  assert.equal(predictCf(new Map([["Z", 8]]), 7, [], config), null);
  assert.equal(predictCf(new Map([["Z", 8]]), 7, [{ cd: "Q", sim: 0.5, coRaters: 9 }], config), null);
  assert.equal(predictCf(new Map([["Z", 8]]), 7, undefined, config), null);
  // 유사도 합이 너무 작으면(0.1 < 0.2) 근거 부족
  assert.equal(predictCf(new Map([["Z", 8]]), 7, [{ cd: "Z", sim: 0.1, coRaters: 9 }], config), null);
});

test("예측식: 내 평균 + 유사도 가중 평균 편차", () => {
  const mine = new Map([
    ["P", 9],
    ["Q", 5],
  ]);
  const result = predictCf(
    mine,
    7,
    [
      { cd: "P", sim: 0.6, coRaters: 20 },
      { cd: "Q", sim: 0.2, coRaters: 20 },
    ],
    config,
  );
  assert.ok(result);
  // 7 + (0.6×2 + 0.2×(−2)) / 0.8 = 8
  assert.ok(Math.abs(result.score - 0.8) < 1e-12);
  assert.equal(result.neighborCount, 2);
});

test("결과는 항상 0~100% 범위", () => {
  for (const a of [0, 0.2, 0.5, 1]) {
    for (const b of [0, 0.4, 1, 1.5, -0.5]) {
      for (const alpha of [0, 0.3, 0.6, 1]) {
        const v = blendScores(a, b, alpha);
        assert.ok(v >= 0 && v <= 1, `${a} ${b} ${alpha} → ${v}`);
      }
    }
  }
  // 극단적인 편차여도 예측 평점은 0~10으로 잘린다
  const high = predictCf(new Map([["P", 10]]), 1, [{ cd: "P", sim: 0.9, coRaters: 50 }], config);
  assert.ok(high && high.score <= 1);
  const low = predictCf(new Map([["P", 0]]), 9.5, [{ cd: "P", sim: 0.9, coRaters: 50 }], config);
  assert.ok(low && low.score >= 0);
});
