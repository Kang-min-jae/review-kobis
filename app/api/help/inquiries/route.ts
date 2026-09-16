import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { db } from "../../../_lib/db";

const CATEGORIES = ["영화 정보 오류", "신규 영화 추가 요청", "버그 신고", "기타 문의"] as const;
const MAX_IMAGES = 5;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const inquiries = await db.inquiry.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, category: true, title: true, status: true, createdAt: true },
  });

  return NextResponse.json(inquiries);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { category, title, content, images } = body as {
    category: string;
    title: string;
    content: string;
    images: string[];
  };

  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return NextResponse.json({ error: "유효하지 않은 카테고리입니다." }, { status: 400 });
  }
  if (!title?.trim() || title.trim().length > 100) {
    return NextResponse.json({ error: "제목을 1~100자로 입력해 주세요." }, { status: 400 });
  }
  if (!content?.trim() || content.trim().length > 2000) {
    return NextResponse.json({ error: "내용을 1~2000자로 입력해 주세요." }, { status: 400 });
  }
  if (!Array.isArray(images) || images.length > MAX_IMAGES) {
    return NextResponse.json({ error: `이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.` }, { status: 400 });
  }

  const inquiry = await db.inquiry.create({
    data: {
      userId: session.user.id,
      category: category.trim(),
      title: title.trim(),
      content: content.trim(),
      images: images,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: inquiry.id }, { status: 201 });
}
