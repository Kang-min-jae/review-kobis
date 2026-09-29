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

  // 문자열이 아닌 값이 오면 .trim()에서 500으로 끝나지 않게 형식부터 확인한다.
  const { id, adminReply } = body as { id?: unknown; adminReply?: unknown };

  if (typeof id !== "string" || !id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  if (typeof adminReply !== "string" || !adminReply.trim()) {
    return NextResponse.json({ error: "답변 내용을 입력해 주세요." }, { status: 400 });
  }
  if (adminReply.trim().length > 5000) {
    return NextResponse.json({ error: "답변은 5000자 이내로 입력해 주세요." }, { status: 400 });
  }

  // 없는 문의(이미 삭제됨 등)면 update가 예외를 던지므로 updateMany로 확인한다.
  const { count } = await db.inquiry.updateMany({
    where: { id },
    data: { adminReply: adminReply.trim(), status: "처리 완료" },
  });
  if (count === 0) return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });

  return NextResponse.json({ id, status: "처리 완료" });
}
