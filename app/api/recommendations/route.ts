import { NextResponse } from "next/server";
import { getRecommendedForRatedRow } from "../../_lib/movie-rows";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
<<<<<<< HEAD
  const idsParam = searchParams.get("movieCds") ?? "";
  const movieCds = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const results = await getRecommendedForRatedRow(movieCds);

=======
  const idsParam = searchParams.get("tmdbIds") ?? "";
  const tmdbIds = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));

  const results = await getRecommendedForRatedRow(tmdbIds);
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914
  return NextResponse.json({ results });
}
