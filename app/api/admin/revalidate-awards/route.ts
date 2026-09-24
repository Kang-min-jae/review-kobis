// 수상작 데이터 일괄 재검증 엔드포인트.
//
// 수상작 영화 항목(CachedMovie의 wikidata-*)이 틀린 TMDB 영화와 연결돼 다른 영화의 포스터·
// 줄거리·장르가 붙은 경우를 한 번에 정리한다. 연결 정보와 보강 필드를 비우고 검증 전
// 상태로 되돌린 뒤 수상작 목록 캐시를 무효화하면, 다음 조회 때 제목·개봉연도로 검증된
// TMDB 영화로만 다시 채워진다.
//
// 호출 방법:
//   curl -X POST https://<your-domain>/api/admin/revalidate-awards \
//     -H "x-admin-secret: <ADMIN_SECRET 환경변수 값>"

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "../../../_lib/db";

export async function POST(request: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ADMIN_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("x-admin-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 1. 수상작 영화 항목을 검증 전 상태로 초기화 (제목·영문 제목만 남긴다)
  const reset = await db.cachedMovie.updateMany({
    where: { movieCd: { startsWith: "wikidata-" } },
    data: {
      tmdbId: null,
      posterUrl: null,
      overview: null,
      releaseDate: null,
      runtimeMinutes: null,
      genreAlt: null,
      directorName: null,
      directorKmdbId: null,
      directorTmdbId: null,
      cast: [],
      source: "tmdb",
    },
  });

  // 2. 영화제별 수상작 목록 캐시 삭제 (다음 조회 때 다시 받아 검증)
  const deleted = await db.cachedAwardWinners.deleteMany({
    where: { OR: ["academy-", "cannes-", "berlin-", "venice-"].map((p) => ({ id: { startsWith: p } })) },
  });

  // 3. 수상작 행(unstable_cache)과 영화 행 캐시 무효화
  revalidateTag("award-winners", { expire: 0 });
  revalidateTag("movie-rows", { expire: 0 });

  return NextResponse.json({
    ok: true,
    awardMoviesReset: reset.count,
    festivalListCachesDeleted: deleted.count,
    revalidated: ["award-winners", "movie-rows"],
  });
}
