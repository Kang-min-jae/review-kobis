import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { db } from "../../../_lib/db";

// 예고편 차단 목록 관리(관리자 전용).
//   GET    /api/admin/blocked-videos              → 차단 목록
//   POST   /api/admin/blocked-videos  { videoKey, movieCd?, reason? } → 차단
//   DELETE /api/admin/blocked-videos?videoKey=XXX → 차단 해제
const VIDEO_KEY_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  const rows = await db.blockedVideoKey.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { videoKey?: unknown; movieCd?: unknown; reason?: unknown } | null;
  if (!body || typeof body.videoKey !== "string" || !VIDEO_KEY_PATTERN.test(body.videoKey)) {
    return NextResponse.json({ error: "잘못된 영상 key입니다." }, { status: 400 });
  }
  const movieCd = typeof body.movieCd === "string" ? body.movieCd.slice(0, 64) : null;
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : null;
  const row = await db.blockedVideoKey.upsert({
    where: { videoKey: body.videoKey },
    create: { videoKey: body.videoKey, movieCd, reason, createdBy: session.user.id },
    update: { movieCd, reason },
  });
  return NextResponse.json(row);
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  const videoKey = new URL(request.url).searchParams.get("videoKey");
  if (!videoKey || !VIDEO_KEY_PATTERN.test(videoKey)) return NextResponse.json({ error: "잘못된 영상 key입니다." }, { status: 400 });
  await db.blockedVideoKey.deleteMany({ where: { videoKey } });
  return NextResponse.json({ ok: true });
}
