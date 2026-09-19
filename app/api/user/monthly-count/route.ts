import { auth } from "../../../../../auth";
import { db } from "../../../_lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ count: 0 });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const count = await db.categoryRating.count({
    where: {
      userId: session.user.id,
      category: "전체",
      createdAt: { gte: monthStart, lt: monthEnd },
    },
  });

  return NextResponse.json({ count });
}
