import { NextResponse } from "next/server";
import { getNotices } from "../../../_lib/notices";

async function handleGet() {
  const notices = (await getNotices()).slice(0, 20).map(({ id, type, title, isNew, createdAt }) => ({ id, type, title, isNew, createdAt }));
  return NextResponse.json(notices);
}

// 공지 목록은 모두에게 같다 — CDN에 1시간 캐시한다(목록 자체는 notices.ts가 하루 캐시, 바뀌면 바로 지운다).
export async function GET() {
  const res = await handleGet();
  if (res.status === 200) res.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res;
}
