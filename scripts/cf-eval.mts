// 협업 필터링(CF) 오프라인 검증 — CF를 켜기 전에 "섞으면 정말 더 정확해지는지" 확인한다.
//
// 평점이 CF_MIN_USER_RATINGS(기본 5)개 이상인 회원마다 가장 최근 평점 20%를 숨기고, 나머지로
//   A(지금의 취향 점수), B(CF 예측), 하이브리드(1 − α)·A + α·B
// 를 만들어 숨긴 실제 평점과 비교한다(MAE, 0~10점 척도 — 점수 0~1 × 10). 유사도와 사이트 평균도
// 숨긴 평점을 뺀 데이터로 다시 계산해, 정답이 새어 들어가지 않게 한다.
//
//  · 데이터가 기준(CF_MIN_TOTAL_RATINGS / CF_MIN_USERS) 미만이면 "데이터 부족" 출력 후 정상 종료(0).
//  · 하이브리드 MAE가 A보다 나쁘면 "CF를 켜지 마세요" 출력 후 종료 코드 1.
//
// 실행 방법 (프로젝트 루트에서):  npm run cf:eval
// 다른 회원의 ID·평점은 출력하지 않는다 — 집계 수치만 보여준다.

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local", override: true });

const { db } = await import("../app/_lib/db");
const { getCfConfig, CF_MIN_MOVIE_RATERS } = await import("../app/_lib/cf-config");
const { blendScores, computeAlpha, computeItemSimilarities, isCfGateOpen, meanOf, predictCf } = await import(
  "../app/_lib/cf-core"
);
const { countCfGlobalStats } = await import("../app/_lib/cf-similarity-compute");
const { buildTasteContextFromMetas, contentAffinityRaw, toTasteMeta } = await import("../app/_lib/affinity-data");
const { cdToMovieId, CATEGORY_KEYS, isSeriesCd } = await import("../app/_lib/rating-input");

type Row = { userId: string; movieCd: string; category: string; score: number; createdAt: Date };
type QualityStats = {
  overallAvg: number | null;
  overallCount: number;
  categoryStats: Record<string, { avg: number; count: number }>;
};

const HOLDOUT_RATIO = 0.2;

async function main(): Promise<number> {
  const config = getCfConfig();
  const stats = await countCfGlobalStats(db);
  console.log(`사이트 전체 평점 ${stats.totalRatings}개 / 평점 남긴 회원 ${stats.ratingUsers}명`);
  console.log(`기준: 평점 ${config.minTotalRatings}개 이상, 회원 ${config.minUsers}명 이상`);
  // 검증은 "켤지 말지"를 정하려는 것이라 CF_ENABLED와 상관없이 데이터 기준만 본다.
  if (!isCfGateOpen({ ...config, enabled: true }, stats)) {
    console.log("데이터 부족: CF는 꺼진 상태 유지");
    return 0;
  }

  const rows: Row[] = (
    await db.categoryRating.findMany({
      where: { category: { in: ["전체", ...CATEGORY_KEYS] } },
      select: { userId: true, movieCd: true, category: true, score: true, createdAt: true },
    })
  ).filter((r) => !isSeriesCd(r.movieCd));

  const overall = rows.filter((r) => r.category === "전체");
  const byUser = new Map<string, Row[]>();
  for (const r of overall) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  // 회원별 최근 20% 숨기기
  const hidden = new Set<string>(); // `${userId}|${movieCd}`
  const evalUsers: string[] = [];
  for (const [userId, list] of byUser) {
    if (list.length < config.minUserRatings) continue;
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const count = Math.max(1, Math.round(list.length * HOLDOUT_RATIO));
    for (const r of list.slice(list.length - count)) hidden.add(`${userId}|${r.movieCd}`);
    evalUsers.push(userId);
  }
  const isHidden = (r: Row) => hidden.has(`${r.userId}|${r.movieCd}`);
  const train = rows.filter((r) => !isHidden(r));
  const trainOverall = train.filter((r) => r.category === "전체");

  // 숨긴 평점을 뺀 데이터로 유사도·사이트 평균 다시 계산
  const neighbors = computeItemSimilarities(trainOverall, config, CF_MIN_MOVIE_RATERS);
  const quality = new Map<string, QualityStats>();
  const acc = new Map<string, Map<string, { sum: number; count: number }>>();
  for (const r of train) {
    const perMovie = acc.get(r.movieCd) ?? new Map();
    const entry = perMovie.get(r.category) ?? { sum: 0, count: 0 };
    entry.sum += r.score;
    entry.count += 1;
    perMovie.set(r.category, entry);
    acc.set(r.movieCd, perMovie);
  }
  for (const [cd, perMovie] of acc) {
    const q: QualityStats = { overallAvg: null, overallCount: 0, categoryStats: {} };
    for (const [category, { sum, count }] of perMovie) {
      if (category === "전체") {
        q.overallAvg = sum / count;
        q.overallCount = count;
      } else {
        q.categoryStats[category] = { avg: sum / count, count };
      }
    }
    quality.set(cd, q);
  }

  const metaRows = await db.cachedMovie.findMany({
    where: { movieCd: { in: [...new Set(overall.map((r) => r.movieCd))] } },
    select: { movieCd: true, genreAlt: true, directorName: true, cast: true, tmdbId: true },
  });
  const metas = new Map(metaRows.map((m) => [m.movieCd, toTasteMeta(m)]));

  let n = 0;
  let nWithCf = 0;
  let errA = 0;
  let errHybrid = 0;
  let errB = 0;
  let errAOnCf = 0;
  let alphaSum = 0;

  for (const userId of evalUsers) {
    const mine = train.filter((r) => r.userId === userId);
    const mineOverall = mine.filter((r) => r.category === "전체");
    const targets = overall.filter((r) => r.userId === userId && isHidden(r));
    const ratings = mineOverall.map((r) => ({
      movieId: cdToMovieId(r.movieCd),
      rating: r.score,
      ratedAt: r.createdAt.toISOString(),
    }));
    const categoryRatings = mine
      .filter((r) => r.category !== "전체")
      .map((r) => ({ movieId: cdToMovieId(r.movieCd), category: r.category, value: r.score }));
    const taste = buildTasteContextFromMetas(ratings, categoryRatings, metas);
    const myMap = new Map(mineOverall.map((r) => [r.movieCd, r.score]));
    const myMean = meanOf([...myMap.values()]);
    if (myMean === null) continue;

    for (const t of targets) {
      const a = contentAffinityRaw(metas.get(t.movieCd), taste.ctx, quality.get(t.movieCd));
      if (a === null) continue;
      const b = predictCf(myMap, myMean, neighbors.get(t.movieCd), config);
      const alpha = computeAlpha(config, {
        gateOpen: true,
        myRatingCount: myMap.size,
        neighborCount: b?.neighborCount ?? 0,
        hasCfScore: b !== null,
      });
      const hybrid = blendScores(a, b?.score ?? null, alpha);
      n += 1;
      errA += Math.abs(a * 10 - t.score);
      errHybrid += Math.abs(hybrid * 10 - t.score);
      if (b) {
        nWithCf += 1;
        errB += Math.abs(b.score * 10 - t.score);
        errAOnCf += Math.abs(a * 10 - t.score);
        alphaSum += alpha;
      }
    }
  }

  if (n === 0) {
    console.log("평가할 수 있는 숨긴 평점이 없습니다(작품 정보 부족). CF는 꺼진 상태 유지");
    return 0;
  }
  const fmt = (v: number) => v.toFixed(3);
  console.log(`검증 회원 ${evalUsers.length}명, 숨긴 평점 ${n}개 (CF 예측 가능 ${nWithCf}개, ${((nWithCf / n) * 100).toFixed(1)}%)`);
  console.log(`MAE  A(현재 방식)   : ${fmt(errA / n)}`);
  console.log(`MAE  하이브리드     : ${fmt(errHybrid / n)}`);
  if (nWithCf > 0) {
    console.log(`MAE  B(CF만, ${nWithCf}개) : ${fmt(errB / nWithCf)}  /  같은 평점의 A: ${fmt(errAOnCf / nWithCf)}`);
    console.log(`평균 α(CF 적용 평점) : ${fmt(alphaSum / nWithCf)}`);
  }

  if (errHybrid / n > errA / n) {
    console.log("결과: 하이브리드가 현재 방식보다 부정확합니다. CF를 켜지 마세요.");
    return 1;
  }
  console.log("결과: 하이브리드가 현재 방식보다 나쁘지 않습니다. CF_ENABLED=true로 켜도 됩니다.");
  return 0;
}

let code = 1;
try {
  code = await main();
} catch (error) {
  console.error("검증 실패:", error);
  code = 1;
} finally {
  await db.$disconnect();
}
process.exit(code);
