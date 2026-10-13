// 협업 필터링(CF) 상태 확인 (관리자 전용, 비공개).
//   curl https://stilltheater.com/api/admin/cf-status -H "Authorization: Bearer <ADMIN_SECRET>"
// 집계값만 돌려준다 — 회원 ID·닉네임·개별 평점은 넣지 않는다. robots.txt는 /api/ 전체를 막는다.

import { NextResponse } from "next/server";
import { db } from "../../../_lib/db";
import { isValidAdminSecret } from "../../../_lib/admin-secret";
import { getCfConfig } from "../../../_lib/cf-config";
import { isCfGateOpen } from "../../../_lib/cf-core";
import { CF_STATS_ID, countCfGlobalStats } from "../../../_lib/cf-similarity-compute";

function isAuthorized(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  const bearer = request.headers.get("authorization");
  return Boolean(
    secret && bearer?.startsWith("Bearer ") && isValidAdminSecret(bearer.slice("Bearer ".length), secret),
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const config = getCfConfig();
  try {
    const [live, stored] = await Promise.all([
      countCfGlobalStats(db),
      db.cfStats.findUnique({ where: { id: CF_STATS_ID } }).catch(() => null),
    ]);
    // 요청 시 게이트는 야간 크론이 저장한 값으로 판단한다(stored). live는 지금 이 순간의 실제 수다.
    const gateOpen = isCfGateOpen(config, stored);
    return NextResponse.json({
      cfEnabled: config.enabled,
      cfActive: gateOpen,
      totalRatings: live.totalRatings,
      ratingUsers: live.ratingUsers,
      thresholds: {
        totalRatings: { required: config.minTotalRatings, met: live.totalRatings >= config.minTotalRatings },
        ratingUsers: { required: config.minUsers, met: live.ratingUsers >= config.minUsers },
      },
      stored: stored
        ? {
            totalRatings: stored.totalRatings,
            ratingUsers: stored.ratingUsers,
            pairCount: stored.pairCount,
            avgCoRaters: Math.round(stored.avgCoRaters * 10) / 10,
            lastCronRunAt: stored.lastRunAt.toISOString(),
            lastFullPassAt: stored.lastPassAt?.toISOString() ?? null,
            passInProgress: stored.cursor !== null,
          }
        : null,
      config: {
        minCoRaters: config.minCoRaters,
        shrinkage: config.shrinkage,
        alphaMax: config.alphaMax,
        neighborsK: config.neighborsK,
        minUserRatings: config.minUserRatings,
        fullUserRatings: config.fullUserRatings,
        fullNeighbors: config.fullNeighbors,
      },
    });
  } catch (error) {
    console.error("[cf-status] 조회 실패:", error);
    return NextResponse.json({ error: "status failed" }, { status: 500 });
  }
}
