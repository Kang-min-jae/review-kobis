import { NextResponse } from "next/server";
import { db } from "../../_lib/db";

const USERNAME_RE = /^[a-zA-Z0-9_]{4,20}$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username") ?? "";

  if (!username) return NextResponse.json({ available: false, reason: "empty" });
  if (username.length < 4) return NextResponse.json({ available: false, reason: "too_short" });
  if (username.length > 20) return NextResponse.json({ available: false, reason: "too_long" });
  if (!USERNAME_RE.test(username)) return NextResponse.json({ available: false, reason: "invalid" });

  const existing = await db.user.findUnique({ where: { username } });
  return NextResponse.json({ available: !existing });
}
