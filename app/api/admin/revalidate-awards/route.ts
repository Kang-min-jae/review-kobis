// 수상작 포스터 캐시 강제 재검증 엔드포인트.
//
// Next.js unstable_cache(12h TTL)와 DB CachedMovie 양쪽을 한 번에 정리한다.
// 잘못된 TMDB ID로 오염된 포스터를 올바른 것으로 즉시 교체하기 위해 배포 후 한 번만 호출하면 된다.
//
// 호출 방법:
//   curl -X POST https://<your-domain>/api/admin/revalidate-awards \
//     -H "x-admin-secret: <ADMIN_SECRET 환경변수 값>"

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "../../../_lib/db";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const TMDB_API_BASE = "https://api.themoviedb.org/3";

// 올바른 TMDB ID 목록 (FALLBACK_WINNERS v6 기준)
const CORRECT_MOVIES = [
  { qid: "Q125499906", titleEn: "Anora",          tmdbId: "1064213"  },
  { qid: "Q108851477", titleEn: "The Brutalist",  tmdbId: "1010818"  },
  { qid: "Q128029218", titleEn: "Conclave",       tmdbId: "1063879"  },
  { qid: "Q128023745", titleEn: "I'm Still Here", tmdbId: "1032823"  },
];

async function fetchTmdbPoster(tmdbId: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${TMDB_API_BASE}/movie/${tmdbId}?api_key=${apiKey}&language=ko-KR`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { poster_path?: string | null };
    return data.poster_path ? `${TMDB_IMAGE_BASE}${data.poster_path}` : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ADMIN_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("x-admin-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tmdbApiKey = process.env.TMDB_API_KEY ?? null;
  const results: Record<string, string> = {};

  // 1. CachedMovie 포스터 직접 갱신
  for (const movie of CORRECT_MOVIES) {
    const movieCd = `wikidata-${movie.qid}`;
    let posterUrl: string | null = null;

    if (tmdbApiKey) {
      posterUrl = await fetchTmdbPoster(movie.tmdbId, tmdbApiKey);
    }

    const updated = await db.cachedMovie.updateMany({
      where: { movieCd },
      data: { posterUrl, tmdbId: movie.tmdbId },
    });

    results[movie.titleEn] = updated.count > 0
      ? (posterUrl ? `갱신 → ${posterUrl.slice(-20)}` : "null로 초기화")
      : "레코드 없음";
  }

  // 2. CachedAwardWinners academy 캐시 삭제 (SPARQL 재조회 유도)
  const deleted = await db.cachedAwardWinners.deleteMany({
    where: { id: { startsWith: "academy-" } },
  });

  // 3. Next.js data cache 무효화 (unstable_cache 12h TTL 강제 만료)
  revalidateTag("award-winners", { expire: 0 });

  return NextResponse.json({
    ok: true,
    cachedMovieUpdates: results,
    cachedAwardWinnersDeleted: deleted.count,
    revalidated: "award-winners",
  });
}
