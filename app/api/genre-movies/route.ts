import { NextResponse } from "next/server";
import { getGenreRow, type RowMovie } from "../../_lib/movie-rows";

export async function GET(request: Request): Promise<NextResponse<RowMovie[]>> {
  const { searchParams } = new URL(request.url);
  const genre = searchParams.get("genre") ?? "";
  const offset = Math.max(0, Number(searchParams.get("offset") ?? "0"));
  const pageSize = Math.min(20, Math.max(1, Number(searchParams.get("pageSize") ?? "20")));

  const movies = await getGenreRow(genre, offset, pageSize);
  return NextResponse.json(movies, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
  });
}
