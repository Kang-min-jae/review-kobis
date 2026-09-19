import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { db } from "../../../_lib/db";

const NOTICE_TYPES = ["업데이트", "신규 기능", "점검 안내", "공지"] as const;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const notices = await db.notice.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, title: true, content: true, isNew: true, createdAt: true },
  });
  return NextResponse.json(notices);
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { type, title, content, isNew } = body as {
    type: string;
    title: string;
    content?: string;
    isNew?: boolean;
  };

  if (!NOTICE_TYPES.includes(type as (typeof NOTICE_TYPES)[number])) {
    return NextResponse.json({ error: "유효하지 않은 타입입니다." }, { status: 400 });
  }
  if (!title?.trim() || title.trim().length > 200) {
    return NextResponse.json({ error: "제목을 1~200자로 입력해 주세요." }, { status: 400 });
  }

  const notice = await db.notice.create({
    data: {
      type,
      title: title.trim(),
      content: content?.trim() || null,
      isNew: isNew ?? true,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: notice.id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

  await db.notice.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
