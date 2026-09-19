import { NextResponse } from "next/server";
import { db } from "../../_lib/db";
import { splitGenres } from "../../_lib/movie-rows";
import {
  buildAffinityContext,
  computeBayesianQuality,
  calculateMovieAffinity,
  type RatedMovieForContext,
} from "../../_lib/calculateAffinity";

type IncomingRating = { movieId: string; rating: number };
type RequestBody = {
  movieIds: string[];
  myRatings: IncomingRating[];
  myCategoryRatings: unknown[];
};

// prefixed movieId → CachedMovie.movieCd / CategoryRating.movieCd
// kobis-12345 → "12345", tmdb-12345 → "tmdb-12345", tmdb-tv-123 → "tmdb-tv-123"
function idToCd(movieId: string): string | null {
  if (/^kobis-(\d+)$/.test(movieId)) return movieId.slice("kobis-".length);
  if (movieId.startsWith("tmdb-")) return movieId;
  return null;
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { movieIds, myRatings = [] } = body;
  if (!Array.isArray(movieIds) || movieIds.length === 0) {
    return NextResponse.json({ scores: {} });
  }

  if (myRatings.length === 0) {
    return NextResponse.json({ scores: {}, coldStart: true });
  }

  // ── 1. ID → DB 키 변환 ──────────────────────────────────────────────
  const ratedEntries = myRatings
    .map((r) => ({ movieId: r.movieId, rating: r.rating, cd: idToCd(r.movieId) }))
    .filter((r): r is { movieId: string; rating: number; cd: string } => r.cd !== null);

  const targetEntries = movieIds
    .map((id) => ({ id, cd: idToCd(id) }))
    .filter((e): e is { id: string; cd: string } => e.cd !== null);

  if (targetEntries.length === 0) {
    return NextResponse.json({ scores: {}, coldStart: false });
  }

  const ratedCds = ratedEntries.map((r) => r.cd);
  const targetCds = targetEntries.map((e) => e.cd);
  const allCds = Array.from(new Set([...ratedCds, ...targetCds]));

  // ── 2. 메타 및 커뮤니티 평점 일괄 조회 ─────────────────────────────
  const [metaRows, overallRows] = await Promise.all([
    db.cachedMovie.findMany({
      where: { movieCd: { in: allCds } },
      select: { movieCd: true, genreAlt: true, directorName: true, cast: true },
    }),
    // 전체 평점 — 베이지안 품질 점수용
    db.categoryRating.groupBy({
      by: ["movieCd"],
      where: { movieCd: { in: allCds }, category: "전체" },
      _avg: { score: true },
      _count: { score: true },
    }),
  ]);

  const metaMap = new Map(metaRows.map((m) => [m.movieCd, m]));
  const overallMap = new Map(
    overallRows.map((r) => [r.movieCd, { avg: r._avg.score ?? 0, count: r._count.score }])
  );

  // ── 3. 사용자 선호도 컨텍스트 구축 (장르·감독·배우 평균 평점) ────────
  const ratedMoviesForCtx: RatedMovieForContext[] = ratedEntries
    .map(({ cd, rating }) => {
      const meta = metaMap.get(cd);
      if (!meta) return null;
      const castArr = Array.isArray(meta.cast)
        ? (meta.cast as { name: string }[]).map((p) => p.name)
        : [];
      return {
        rating,
        genres: splitGenres(meta.genreAlt),
        directorName: meta.directorName,
        castNames: castArr,
      };
    })
    .filter((m): m is RatedMovieForContext => m !== null);

  const affinityCtx = buildAffinityContext(ratedMoviesForCtx);

  // ── 4. 각 대상 영화 점수 계산 ────────────────────────────────────────
  const scores: Record<string, number> = {};

  for (const { id, cd } of targetEntries) {
    const meta = metaMap.get(cd);
    const overall = overallMap.get(cd);

    const bayesianQuality = computeBayesianQuality(overall?.avg ?? null, overall?.count ?? 0);
    const castArr = Array.isArray(meta?.cast)
      ? (meta!.cast as { name: string }[]).map((p) => p.name)
      : [];

    const raw = calculateMovieAffinity(
      {
        genres: meta ? splitGenres(meta.genreAlt) : [],
        directorName: meta?.directorName ?? null,
        castNames: castArr,
      },
      affinityCtx,
      bayesianQuality,
    );

    const percent = Math.round(raw * 100);
    if (percent > 0) {
      scores[id] = Math.min(99, Math.max(1, percent));
    }
  }

  return NextResponse.json({ scores, coldStart: false });
}
