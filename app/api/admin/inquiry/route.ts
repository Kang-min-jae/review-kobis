import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { db } from "../../../_lib/db";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const inquiries = await db.inquiry.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      category: true,
      title: true,
      content: true,
      status: true,
      adminReply: true,
      createdAt: true,
      user: { select: { id: true, nickname: true, email: true } },
    },
  });
  return NextResponse.json(inquiries);
}

export async function PATCH(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { id, adminReply } = body as { id: string; adminReply: string };

  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  if (!adminReply?.trim()) return NextResponse.json({ error: "답변 내용을 입력해 주세요." }, { status: 400 });

  const updated = await db.inquiry.update({
    where: { id },
    data: { adminReply: adminReply.trim(), status: "처리 완료" },
    select: { id: true, status: true },
  });

  return NextResponse.json(updated);
}
