import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { db } from "../../../_lib/db";
import { CHANNEL_KEY_PATTERN } from "../../../_lib/official-channels";

// 예고편 채널 규칙 관리(관리자 전용).
//   GET    /api/admin/trailer-channels                                   → 규칙 목록
//   POST   /api/admin/trailer-channels { channelKey, channelName?, allowed } → 허용(true)/차단(false)
//   DELETE /api/admin/trailer-channels?channelKey=@handle                → 규칙 삭제(기본 목록 기준으로 돌아감)
async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  return NextResponse.json(await db.trailerChannelRule.findMany({ orderBy: { createdAt: "desc" } }));
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { channelKey?: unknown; channelName?: unknown; allowed?: unknown } | null;
  if (!body || typeof body.channelKey !== "string" || !CHANNEL_KEY_PATTERN.test(body.channelKey) || typeof body.allowed !== "boolean") {
    return NextResponse.json({ error: "channelKey(@handle 또는 channel/UC…)와 allowed(true/false)가 필요합니다." }, { status: 400 });
  }
  const channelName = typeof body.channelName === "string" ? body.channelName.slice(0, 200) : null;
  const row = await db.trailerChannelRule.upsert({
    where: { channelKey: body.channelKey },
    create: { channelKey: body.channelKey, channelName, allowed: body.allowed, createdBy: session.user.id },
    update: { channelName, allowed: body.allowed, createdBy: session.user.id },
  });
  return NextResponse.json(row);
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  const channelKey = new URL(request.url).searchParams.get("channelKey");
  if (!channelKey || !CHANNEL_KEY_PATTERN.test(channelKey)) return NextResponse.json({ error: "잘못된 채널입니다." }, { status: 400 });
  await db.trailerChannelRule.deleteMany({ where: { channelKey } });
  return NextResponse.json({ ok: true });
}
