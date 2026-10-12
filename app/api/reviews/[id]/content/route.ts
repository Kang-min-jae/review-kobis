import { NextResponse } from "next/server";
import { db } from "../../../../_lib/db";

// GET /api/reviews/{id}/content — 스포일러로 가려진 리뷰 본문을 사용자가 "눌러서 보기"를
// 눌렀을 때만 불러온다. 페이지 HTML(메타·og·검색 미리보기)엔 본문이 처음부터 실리지 않는다.
// 검색엔진 색인·공유 캐시에 남지 않도록 noindex / no-store로 응답한다.
const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_request: Request, ctx: RouteContext<"/api/reviews/[id]/content">) {
  const { id } = await ctx.params;
  if (!id || id.length > 64) return NextResponse.json({ error: "not found" }, { status: 404, headers: HEADERS });

  const review = await db.review.findUnique({ where: { id }, select: { content: true } }).catch(() => null);
  if (!review) return NextResponse.json({ error: "not found" }, { status: 404, headers: HEADERS });
  return NextResponse.json({ content: review.content }, { headers: HEADERS });
}
