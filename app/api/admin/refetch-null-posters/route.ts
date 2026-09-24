// null 포스터 레코드 일괄 복구 엔드포인트.
//
// cachedMovie 테이블에서 posterUrl이 null이거나 http:// 로 시작하는 레코드를
// 찾아 updatedAt을 과거로 돌려 즉시 만료 상태로 만든다. 이후 해당 영화가
// 조회될 때 fetchAndCacheMovieMeta가 다시 호출되어 포스터를 재시도한다.
//
// 호출 방법:
//   curl -X POST https://<your-domain>/api/admin/refetch-null-posters \
//     -H "x-admin-secret: <ADMIN_SECRET 환경변수 값>"
//
// 선택적으로 ?dry=true 쿼리파라미터를 붙이면 실제 업데이트 없이 대상 목록만 반환한다.

import { NextResponse } from "next/server";
import { db } from "../../../_lib/db";

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3; // movie-rate-info.ts와 동일

export async function POST(request: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ADMIN_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("x-admin-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "true";

  // null 포스터 또는 http:// 포스터(미변환 레코드) 조회
  const targets = await db.cachedMovie.findMany({
    where: {
      OR: [
        { posterUrl: null },
        { posterUrl: { startsWith: "http://" } },
      ],
    },
    select: { movieCd: true, title: true, posterUrl: true, updatedAt: true },
  });

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      count: targets.length,
      records: targets.map((r) => ({ movieCd: r.movieCd, title: r.title, posterUrl: r.posterUrl })),
    });
  }

  // updatedAt을 TTL 만료 시각으로 설정 — 다음 조회 시 fetchAndCacheMovieMeta 재실행
  const expiredAt = new Date(Date.now() - CACHE_TTL_MS - 1);
  const updated = await db.cachedMovie.updateMany({
    where: {
      movieCd: { in: targets.map((r) => r.movieCd) },
    },
    data: { updatedAt: expiredAt },
  });

  return NextResponse.json({
    ok: true,
    markedExpired: updated.count,
    records: targets.map((r) => ({ movieCd: r.movieCd, title: r.title })),
  });
}
