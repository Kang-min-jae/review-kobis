import { NextResponse } from "next/server";
import {
  getRecommendedForRatedRow,
  getLocalNowShowingByTmdbId,
  applyNowShowingOverrides,
} from "../../_lib/movie-rows";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("tmdbIds") ?? "";
  const tmdbIds = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));

  const [results, nowShowingMap] = await Promise.all([
    getRecommendedForRatedRow(tmdbIds),
    getLocalNowShowingByTmdbId(),
  ]);

  return NextResponse.json({ results: applyNowShowingOverrides(results, nowShowingMap) });
}
