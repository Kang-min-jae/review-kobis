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

  // 문자열이 아닌 값이 오면 .trim()에서 500으로 끝나지 않게 형식부터 확인한다.
  const { type, title, content, isNew } = body as {
    type?: unknown;
    title?: unknown;
    content?: unknown;
    isNew?: unknown;
  };

  if (typeof type !== "string" || !NOTICE_TYPES.includes(type as (typeof NOTICE_TYPES)[number])) {
    return NextResponse.json({ error: "유효하지 않은 타입입니다." }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim() || title.trim().length > 200) {
    return NextResponse.json({ error: "제목을 1~200자로 입력해 주세요." }, { status: 400 });
  }
  if (content !== undefined && content !== null && (typeof content !== "string" || content.length > 10000)) {
    return NextResponse.json({ error: "내용은 10000자 이내 문자열이어야 합니다." }, { status: 400 });
  }

  const notice = await db.notice.create({
    data: {
      type,
      title: title.trim(),
      content: typeof content === "string" ? content.trim() || null : null,
      isNew: typeof isNew === "boolean" ? isNew : true,
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

  // 이미 지워진 공지를 다시 지우면 delete가 예외를 던지므로 deleteMany로 처리한다.
  const { count } = await db.notice.deleteMany({ where: { id } });
  if (count === 0) return NextResponse.json({ error: "공지를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
