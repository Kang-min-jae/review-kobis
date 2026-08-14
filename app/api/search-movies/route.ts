import { NextResponse } from "next/server";
import { searchMoviesSince1960 } from "../../_lib/tmdb";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const results = await searchMoviesSince1960(query);
  return NextResponse.json({ results });
}
