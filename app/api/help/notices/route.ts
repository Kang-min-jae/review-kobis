import { NextResponse } from "next/server";
import { db } from "../../../_lib/db";

export async function GET() {
  const notices = await db.notice.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, type: true, title: true, isNew: true, createdAt: true },
  });
  return NextResponse.json(notices);
}
