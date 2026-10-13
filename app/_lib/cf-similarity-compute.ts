// 협업 필터링(CF) 야간 계산 — 전역 통계(CfStats)와 영화 간 유사도(MovieCfSimilarity).
//
// 유사도 식은 cf-core.ts의 computeItemSimilarities와 같다:
//   d_ui  = r_ui − mean_u                       (mean_u = 그 회원의 영화 "전체" 평점 평균)
//   sim   = Σ d_ui·d_uj / sqrt(Σ d_ui² · Σ d_uj²)  (두 영화를 모두 평가한 회원 u만)
//   sim'  = sim × n / (n + λ)                   (n = 공동 평가자 수, n < CF_MIN_CO_RATERS면 버림)
// sim' < CF_MIN_SIMILARITY인 쌍은 버리고 영화당 상위 CF_NEIGHBORS_K개만 저장한다.
//
// 회원이 늘어도 서버리스 시간 제한 안에 끝나도록 평가자가 CF_MIN_MOVIE_RATERS명 이상인 영화만,
// movieCd 순서로 CF_BATCH_SIZE편씩 나눠 계산한다. 시간이 모자라면 cursor에 위치를 남기고 다음 실행이
// 이어서 한다. 한 바퀴를 다 돌면 이번 바퀴에서 갱신되지 않은(이제 기준 미달인) 영화의 행을 지운다.
// 회원 ID는 계산 중 SQL 안에서만 쓰이고, 저장되는 건 영화 쌍의 집계값뿐이다.

import type { PrismaClient } from "../generated/prisma/client";
import type { CfConfig } from "./cf-core";
import { CF_BATCH_SIZE, CF_MIN_MOVIE_RATERS, CF_TIME_BUDGET_MS } from "./cf-config";

export const CF_STATS_ID = "global";

export type CfCronResult = {
  totalRatings: number;
  ratingUsers: number;
  moviesProcessed: number;
  passCompleted: boolean;
  cursor: string | null;
  pairCount: number;
};

// 사이트 전체 "전체" 평점 수와 평점을 1개 이상 남긴 회원 수.
export async function countCfGlobalStats(client: PrismaClient): Promise<{ totalRatings: number; ratingUsers: number }> {
  const [row] = await client.$queryRaw<{ total: bigint; users: bigint }[]>`
    SELECT COUNT(*) AS total, COUNT(DISTINCT "userId") AS users
    FROM "CategoryRating" WHERE "category" = '전체'
  `;
  return { totalRatings: Number(row?.total ?? 0), ratingUsers: Number(row?.users ?? 0) };
}

async function nextBatch(client: PrismaClient, cursor: string | null, size: number): Promise<string[]> {
  const rows = await client.$queryRaw<{ movieCd: string }[]>`
    SELECT "movieCd" FROM "CategoryRating"
    WHERE "category" = '전체' AND "movieCd" NOT LIKE 'tmdb-tv-%' AND "movieCd" > ${cursor ?? ""}
    GROUP BY "movieCd"
    HAVING COUNT(*) >= ${CF_MIN_MOVIE_RATERS}
    ORDER BY "movieCd"
    LIMIT ${size}
  `;
  return rows.map((r) => r.movieCd);
}

async function replaceBatch(client: PrismaClient, batch: string[], config: CfConfig): Promise<void> {
  // 지우고 다시 넣는 걸 한 트랜잭션으로 묶어, 계산 도중 요청이 빈 이웃 목록을 보지 않게 한다.
  await client.$transaction([
    client.$executeRaw`DELETE FROM "MovieCfSimilarity" WHERE "movieCd" = ANY(${batch}::text[])`,
    client.$executeRaw`
      INSERT INTO "MovieCfSimilarity" ("movieCd", "neighborCd", "similarity", "coRaters", "updatedAt")
      WITH movie_ratings AS (
        SELECT "userId", "movieCd", "score" FROM "CategoryRating"
        WHERE "category" = '전체' AND "movieCd" NOT LIKE 'tmdb-tv-%'
      ),
      user_means AS (
        SELECT "userId", AVG("score") AS m FROM movie_ratings GROUP BY "userId"
      ),
      eligible AS (
        SELECT "movieCd" FROM movie_ratings GROUP BY "movieCd" HAVING COUNT(*) >= ${CF_MIN_MOVIE_RATERS}
      ),
      centered AS (
        SELECT r."userId", r."movieCd", r."score" - um.m AS d
        FROM movie_ratings r
        JOIN user_means um ON um."userId" = r."userId"
        JOIN eligible e ON e."movieCd" = r."movieCd"
      ),
      pairs AS (
        SELECT a."movieCd" AS m1, b."movieCd" AS m2, COUNT(*)::int AS n,
               SUM(a.d * b.d) AS dot, SUM(a.d * a.d) AS na, SUM(b.d * b.d) AS nb
        FROM centered a
        JOIN centered b ON a."userId" = b."userId" AND a."movieCd" <> b."movieCd"
        WHERE a."movieCd" = ANY(${batch}::text[])
        GROUP BY a."movieCd", b."movieCd"
        HAVING COUNT(*) >= ${config.minCoRaters}
      ),
      scored AS (
        SELECT m1, m2, n, (dot / SQRT(na * nb)) * n::float8 / (n::float8 + ${config.shrinkage}::float8) AS sim
        FROM pairs WHERE na > 0 AND nb > 0
      ),
      ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY m1 ORDER BY sim DESC, n DESC, m2) AS rn
        FROM scored WHERE sim >= ${config.minSimilarity}::float8
      )
      SELECT m1, m2, sim, n, NOW() FROM ranked WHERE rn <= ${config.neighborsK}
    `,
  ]);
}

export async function runCfCron(
  client: PrismaClient,
  config: CfConfig,
  options: { timeBudgetMs?: number; batchSize?: number } = {},
): Promise<CfCronResult> {
  const startedAt = Date.now();
  const budget = options.timeBudgetMs ?? CF_TIME_BUDGET_MS;
  const batchSize = options.batchSize ?? CF_BATCH_SIZE;

  const counts = await countCfGlobalStats(client);
  const existing = await client.cfStats.findUnique({ where: { id: CF_STATS_ID } });
  let cursor = existing?.cursor ?? null;
  // 바퀴 시작 시각은 DB 시계로 잡는다 — 행의 updatedAt(DB의 NOW())과 비교하므로 서버 시계와 어긋나면 안 된다.
  const dbNow = async () => (await client.$queryRaw<{ now: Date }[]>`SELECT NOW() AS now`)[0].now;
  const passStartedAt = cursor && existing?.passStartedAt ? existing.passStartedAt : await dbNow();
  let lastPassAt = existing?.lastPassAt ?? null;
  let moviesProcessed = 0;
  let passCompleted = false;

  await client.cfStats.upsert({
    where: { id: CF_STATS_ID },
    create: { id: CF_STATS_ID, ...counts, cursor, passStartedAt },
    update: { ...counts, cursor, passStartedAt, lastRunAt: new Date() },
  });

  // 시간이 아무리 빠듯해도 실행마다 최소 한 묶음은 처리해 다음 위치로 나아간다.
  do {
    const batch = await nextBatch(client, cursor, batchSize);
    if (batch.length === 0) {
      // 한 바퀴 끝 — 이번 바퀴에서 갱신되지 않은 영화(평가자가 줄어 기준 미달 등)의 이웃을 지운다.
      await client.movieCfSimilarity.deleteMany({ where: { updatedAt: { lt: passStartedAt } } });
      passCompleted = true;
      cursor = null;
      lastPassAt = new Date();
      break;
    }
    await replaceBatch(client, batch, config);
    moviesProcessed += batch.length;
    cursor = batch[batch.length - 1];
    await client.cfStats.update({ where: { id: CF_STATS_ID }, data: { cursor } });
  } while (Date.now() - startedAt < budget);

  const [agg] = await client.$queryRaw<{ pairs: bigint; avg: number | null }[]>`
    SELECT COUNT(DISTINCT (LEAST("movieCd", "neighborCd"), GREATEST("movieCd", "neighborCd"))) AS pairs,
           AVG("coRaters")::float8 AS avg
    FROM "MovieCfSimilarity"
  `;
  const pairCount = Number(agg?.pairs ?? 0);
  await client.cfStats.update({
    where: { id: CF_STATS_ID },
    data: {
      cursor,
      passStartedAt: cursor ? passStartedAt : null,
      lastPassAt,
      pairCount,
      avgCoRaters: agg?.avg ?? 0,
      lastRunAt: new Date(),
    },
  });

  return { ...counts, moviesProcessed, passCompleted, cursor, pairCount };
}
