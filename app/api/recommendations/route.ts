import { NextResponse } from "next/server";
import { getRecommendedForRatedRow } from "../../_lib/movie-rows";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("tmdbIds") ?? "";
  const tmdbIds = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));

  const results = await getRecommendedForRatedRow(tmdbIds);
  return NextResponse.json({ results });
}
