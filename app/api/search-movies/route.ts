import { NextResponse } from "next/server";
import { searchMoviesSince1960 } from "../../_lib/kobis";
import { searchKmdbPeople, suggestSimilarTitle } from "../../_lib/kmdb";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ movies: [], people: [], correctedQuery: null });
  }

  const [movies, people] = await Promise.all([
    searchMoviesSince1960(query),
    searchKmdbPeople(query, 8),
  ]);

  if (movies.length > 0 || people.length > 0) {
    return NextResponse.json({ movies, people, correctedQuery: null });
  }

  // 정확히 일치하는 결과가 없으면(오타 가능성), 비슷한 제목으로 한 번 더 찾아본다.
  const suggested = await suggestSimilarTitle(query);
  if (!suggested) {
    return NextResponse.json({ movies: [], people: [], correctedQuery: null });
  }

  const [correctedMovies, correctedPeople] = await Promise.all([
    searchMoviesSince1960(suggested),
    searchKmdbPeople(suggested, 8),
  ]);
  const found = correctedMovies.length > 0 || correctedPeople.length > 0;

  return NextResponse.json({
    movies: correctedMovies,
    people: correctedPeople,
    correctedQuery: found ? suggested : null,
  });
}
