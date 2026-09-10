import { NextResponse } from "next/server";
import { computeSeedGenres } from "../../_lib/movie-rows";

// 모든 영화 카드의 "추천 N%" 배지가 공통으로 쓰는 재료 — 사용자가 평가한 영화들의
// 장르 집합. 평점(localStorage)은 브라우저에만 있어 서버 컴포넌트가 직접 못 읽으므로,
// 클라이언트(seed-genres-store.ts)가 이 API로 movieCds를 넘겨 받아온다.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("movieCds") ?? "";
  const movieCds = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const genres = await computeSeedGenres(movieCds);

  return NextResponse.json({ genres });
}
