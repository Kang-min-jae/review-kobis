import { NextResponse } from "next/server";
import { getGenreRow, GENRE_KEYWORDS, type RowMovie } from "../../_lib/movie-rows";
import { withFreshRatings } from "../../_lib/fresh-ratings";

// 외부 API·AI 응답이 늦어도 이 시간 안에 끝낸다(함수가 오래 붙잡혀 사용량이 늘지 않게).
export const maxDuration = 30;

// "더 보기"로 불러올 수 있는 최대 위치 — 임의의 큰 값·문자열이 오면 DB 조회가 실패하거나
// 요청마다 새 캐시 항목이 쌓여, 알려진 장르와 정수 범위만 받는다.
const MAX_OFFSET = 400;

export async function GET(request: Request): Promise<NextResponse<RowMovie[]>> {
  const { searchParams } = new URL(request.url);
  const genre = searchParams.get("genre") ?? "";
  if (!Object.hasOwn(GENRE_KEYWORDS, genre)) return NextResponse.json([]);
  const rawOffset = Math.floor(Number(searchParams.get("offset") ?? "0"));
  const rawPageSize = Math.floor(Number(searchParams.get("pageSize") ?? "20"));
  const offset = Number.isFinite(rawOffset) ? Math.min(MAX_OFFSET, Math.max(0, rawOffset)) : 0;
  const pageSize = Number.isFinite(rawPageSize) ? Math.min(20, Math.max(1, rawPageSize)) : 20;

  // 평균 별점은 최신 값으로 덮어쓰고, CDN 캐시는 1분만 둔다(평점을 남기면 "더 보기" 카드에도 곧 반영되게).
  const movies = await withFreshRatings(await getGenreRow(genre, offset, pageSize));
  return NextResponse.json(movies, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
