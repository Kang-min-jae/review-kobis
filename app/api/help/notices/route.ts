import { NextResponse } from "next/server";
import { db } from "../../../_lib/db";

async function handleGet() {
  const notices = await db.notice.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, type: true, title: true, isNew: true, createdAt: true },
  });
  return NextResponse.json(notices);
}

// 공지 목록은 모두에게 같다 — CDN에 5분 캐시한다.
export async function GET() {
  const res = await handleGet();
  if (res.status === 200) res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  return res;
}
