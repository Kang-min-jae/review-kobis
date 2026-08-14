import { NextResponse } from "next/server";
import {
  getRecommendedForRatedRow,
  getLocalNowShowingByMovieCd,
  applyNowShowingOverrides,
} from "../../_lib/movie-rows";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("movieCds") ?? "";
  const movieCds = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [results, nowShowingMap] = await Promise.all([
    getRecommendedForRatedRow(movieCds),
    getLocalNowShowingByMovieCd(),
  ]);

  return NextResponse.json({ results: applyNowShowingOverrides(results, nowShowingMap) });
}
