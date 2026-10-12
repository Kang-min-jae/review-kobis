// "이 영화를 좋아한 사람들이 본" 유사도 테이블(MovieSimilarity) 재계산.
//
// 매일 Vercel Cron(vercel.json의 crons)이 GET으로 부른다 — Vercel은 CRON_SECRET 환경변수가
// 있으면 "Authorization: Bearer <CRON_SECRET>" 헤더를 붙여 보낸다.
// 수동 실행: curl -X POST https://<도메인>/api/cron/movie-similarity -H "x-admin-secret: <ADMIN_SECRET>"
// 또는 로컬에서 npx tsx scripts/compute-movie-similarity.mts

import { NextResponse } from "next/server";
import { db } from "../../../_lib/db";
import { isValidAdminSecret } from "../../../_lib/admin-secret";
import { recomputeMovieSimilarity } from "../../../_lib/movie-similarity-compute";

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

async function run(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const startedAt = Date.now();
    const result = await recomputeMovieSimilarity(db);
    return NextResponse.json({ ok: true, ...result, ms: Date.now() - startedAt });
  } catch (error) {
    console.error("[movie-similarity] 재계산 실패:", error);
    return NextResponse.json({ ok: false, error: "recompute failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
