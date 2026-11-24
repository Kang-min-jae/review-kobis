// 성인물 판정 스크립트(scripts/judge-adult-movies.mts)를 돌린 뒤, 바뀐 목록의 캐시만 바로 새로 만든다.
// (부르지 않아도 매일 오전 10시 예약 작업이 같은 일을 한다.) 사이트 전체 캐시는 지우지 않는다.
//
// 호출 방법:
//   curl -X POST https://<your-domain>/api/admin/revalidate-moderation \
//     -H "x-admin-secret: <ADMIN_SECRET 환경변수 값>"

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isValidAdminSecret } from "../../../_lib/admin-secret";
import { MOVIE_MODERATION_TAG } from "../../../_lib/movie-moderation";

export async function POST(request: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return NextResponse.json({ error: "ADMIN_SECRET not configured" }, { status: 500 });
  if (!isValidAdminSecret(request.headers.get("x-admin-secret"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // ① 뺄 작품 목록 ② 메인 줄(장르 줄 포함) ③ 비로그인 기본 추천
  const tags = [MOVIE_MODERATION_TAG, "movie-rows", "recommendations"];
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ ok: true, revalidated: tags });
}
