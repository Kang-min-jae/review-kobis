import { NextResponse } from "next/server";
import { getRecommendedForRatedRow } from "../../_lib/movie-rows";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("movieCds") ?? "";
  const movieCds = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const results = await getRecommendedForRatedRow(movieCds);

  return NextResponse.json({ results });
}
