import { NextResponse } from "next/server";
import { db } from "../../_lib/db";
import { splitGenres } from "../../_lib/movie-rows";

type IncomingRating = { movieId: string; rating: number };
type IncomingCategoryRating = { movieId: string; category: string; value: number };

type RequestBody = {
  movieIds: string[];
  myRatings: IncomingRating[];
  myCategoryRatings: IncomingCategoryRating[];
};

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { movieIds, myRatings = [], myCategoryRatings: _cr = [] } = body;
  if (!Array.isArray(movieIds) || movieIds.length === 0) {
    return NextResponse.json({ scores: {} });
  }

  const coldStart = myRatings.length < 5;

  // 사용자 프로필 구축
  const ratedCds = myRatings.map((r) => r.movieId.replace(/^kobis-/, "")).filter((cd) => /^\d+$/.test(cd));
  const profileMovies =
    ratedCds.length > 0
      ? await db.cachedMovie.findMany({
          where: { movieCd: { in: ratedCds } },
          select: { movieCd: true, genreAlt: true, directorName: true, cast: true },
        })
      : [];

  const profileMeta = new Map(profileMovies.map((m) => [m.movieCd, m]));
  const genreWeights = new Map<string, number>();
  const directorCounts = new Map<string, number>();
  const castCounts = new Map<string, number>();

  for (const rating of myRatings) {
    const cd = rating.movieId.replace(/^kobis-/, "");
    const meta = profileMeta.get(cd);
    if (!meta) continue;
    const w = rating.rating / 10;
    for (const g of splitGenres(meta.genreAlt)) {
      genreWeights.set(g, (genreWeights.get(g) ?? 0) + w);
    }
    if (meta.directorName) directorCounts.set(meta.directorName, (directorCounts.get(meta.directorName) ?? 0) + w);
    const cast = Array.isArray(meta.cast) ? (meta.cast as { name: string }[]) : [];
    for (const p of cast.slice(0, 3)) {
      castCounts.set(p.name, (castCounts.get(p.name) ?? 0) + w);
    }
  }

  const preferredGenres = new Set([...genreWeights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g));
  const preferredDirectors = new Set([...directorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d]) => d));
  const preferredCast = new Set([...castCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => c));

  // 대상 영화 메타 조회 (KOBIS 코드만)
  const targetCds = movieIds.map((id) => id.replace(/^kobis-/, "")).filter((cd) => /^\d+$/.test(cd));
  const targetIdToCd = new Map(
    movieIds.filter((id) => /^kobis-\d+$/.test(id)).map((id) => [id, id.replace(/^kobis-/, "")])
  );

  const targetMovies =
    targetCds.length > 0
      ? await db.cachedMovie.findMany({
          where: { movieCd: { in: targetCds } },
          select: { movieCd: true, genreAlt: true, directorName: true, cast: true },
        })
      : [];

  const targetMeta = new Map(targetMovies.map((m) => [m.movieCd, m]));

  const alpha = coldStart ? 1.0 : 0.3;
  const beta = coldStart ? 0.0 : 0.3;
  const gamma = coldStart ? 0.0 : 0.4;

  const scores: Record<string, number> = {};
  for (const movieId of movieIds) {
    const cd = targetIdToCd.get(movieId);
    if (!cd) continue;
    const meta = targetMeta.get(cd);
    if (!meta) continue;

    const allGenres = splitGenres(meta.genreAlt);
    const matchingGenres = allGenres.filter((g) => preferredGenres.has(g)).length;
    const genreScore = allGenres.length > 0 ? matchingGenres / allGenres.length : 0;

    const cast = Array.isArray(meta.cast) ? (meta.cast as { name: string }[]) : [];
    const directorMatch = meta.directorName && preferredDirectors.has(meta.directorName) ? 1 : 0;
    const castMatch =
      cast.length > 0
        ? cast.filter((c) => preferredCast.has(c.name)).length / Math.min(cast.length, 5)
        : 0;
    const peopleScore = directorMatch * 0.5 + castMatch * 0.5;

    const total = alpha * genreScore + beta * peopleScore + gamma * peopleScore;
    scores[movieId] = Math.round(total * 100);
  }

  return NextResponse.json({ scores, coldStart });
}
