// "이 영화를 좋아한 사람들이 본" 유사도 테이블(MovieSimilarity) 재계산 + 협업 필터링(CF) 야간 계산
// (전역 통계 CfStats, 영화 간 유사도 MovieCfSimilarity — cf-similarity-compute.ts).
// CF 계산이 실패해도(예: 마이그레이션 적용 전) "좋아한 사람들이 본" 결과는 그대로 저장된다.
// CF가 꺼져 있어도(CF_ENABLED 미설정) 통계·유사도는 미리 계산해 둔다 — 켜는 순간 바로 쓸 수 있게.
//
// 매일 Vercel Cron(vercel.json의 crons)이 GET으로 부른다 — Vercel은 CRON_SECRET 환경변수가
// 있으면 "Authorization: Bearer <CRON_SECRET>" 헤더를 붙여 보낸다.
// 수동 실행: curl -X POST https://<도메인>/api/cron/movie-similarity -H "x-admin-secret: <ADMIN_SECRET>"
// 또는 로컬에서 npx tsx scripts/compute-movie-similarity.mts

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { revalidateWorkDetailPages } from "../../../_lib/detail-revalidate";
import { cdToMovieId } from "../../../_lib/rating-input";
import { db } from "../../../_lib/db";
import { isValidAdminSecret } from "../../../_lib/admin-secret";
import { recomputeMovieSimilarity } from "../../../_lib/movie-similarity-compute";
import { runCfCron } from "../../../_lib/cf-similarity-compute";
import { getCfConfig } from "../../../_lib/cf-config";

export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  if (cronSecret && bearer?.startsWith("Bearer ") && isValidAdminSecret(bearer.slice("Bearer ".length), cronSecret)) {
    return true;
  }
  const adminSecret = process.env.ADMIN_SECRET;
  return Boolean(adminSecret && isValidAdminSecret(request.headers.get("x-admin-secret"), adminSecret));
}

// 하루 한 번 바뀌는 것(박스오피스)을 여기서 새로 고친다 — 공용 페이지의 시간 주기를 길게 두고(홈 하루, 상세 7일)
// DB(Neon)를 하루 종일 깨우지 않기 위해서다. 홈 행 목록은 태그를 지워 다음 방문 때 새로 계산하게 하고,
// 박스오피스에 오른 영화의 상세 페이지("박스오피스 N위" 배지)는 그 영화들만 다시 만들게 한다.
async function refreshDailyPages(): Promise<number> {
  revalidateTag("movie-rows", { expire: 0 });
  const rows = await db.rankingSnapshot.findMany({
    where: { listType: { in: ["now_showing", "weekly_box_office"] } },
    select: { movieCd: true },
    take: 100,
  });
  const cds = [...new Set(rows.map((r) => r.movieCd).filter(Boolean))];
  for (const cd of cds) revalidateWorkDetailPages(cdToMovieId(cd));
  return cds.length;
}

async function run(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const startedAt = Date.now();
    const result = await recomputeMovieSimilarity(db);
    const cf = await runCfCron(db, getCfConfig()).catch((error) => {
      console.error("[cf] 야간 계산 실패:", error);
      return { error: "cf failed" };
    });
    const refreshed = await refreshDailyPages().catch((error) => {
      console.error("[cron] 홈·상영작 페이지 새로 고침 실패:", error);
      return 0;
    });
    return NextResponse.json({ ok: true, ...result, cf, refreshed, ms: Date.now() - startedAt });
  } catch (error) {
    console.error("[movie-similarity] 재계산 실패:", error);
    return NextResponse.json({ ok: false, error: "recompute failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
