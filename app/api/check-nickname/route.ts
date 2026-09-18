import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../_lib/prisma";

export async function GET(req: NextRequest) {
  const nickname = req.nextUrl.searchParams.get("nickname")?.trim() ?? "";

  if (nickname.length === 0) {
    return NextResponse.json({ available: false, reason: "empty" });
  }
  if (nickname.length < 2) {
    return NextResponse.json({ available: false, reason: "too_short" });
  }
  if (nickname.length > 20) {
    return NextResponse.json({ available: false, reason: "too_long" });
  }

  const existing = await prisma.user.findUnique({
    where: { nickname },
    select: { id: true },
  });

  return NextResponse.json({ available: existing === null });
}
