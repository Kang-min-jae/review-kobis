import { NextResponse } from "next/server";
import {
  searchTmdbSeries,
  discoverTmdbSeriesByGenre,
  getTmdbPersonTvCredits,
  searchTmdbPerson,
} from "../../_lib/tmdb";
import type { TmdbSeriesDetails } from "../../_lib/tmdb";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

function toRowMovies(series: TmdbSeriesDetails[]) {
  // posterUrl 없어도 gradient 배경으로 표시 (API 키 없거나 포스터 미등록 시리즈)
  return series.map((s) => ({
    id: `tmdb-tv-${s.tmdbId}`,
    title: s.name,
    posterUrl: s.posterUrl,
    gradient: FALLBACK_GRADIENT,
    isNowShowing: false,
    genre: null,
    allGenres: [] as string[],
    firstAirDate: s.firstAirDate,
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const genre = searchParams.get("genre")?.trim() ?? "";
  const actor = searchParams.get("actor")?.trim() ?? "";

  if (!q && !genre && !actor) {
    return NextResponse.json({ results: [] });
  }

  if (genre) {
    const series = await discoverTmdbSeriesByGenre(genre);
    return NextResponse.json({ results: toRowMovies(series) });
  }

  if (actor) {
    // 배우 이름으로 person 검색 → TV 출연작
    const people = await searchTmdbPerson(actor);
    if (people.length === 0) {
      return NextResponse.json({ results: [] });
    }
    const topPerson = people[0];
    const credits = await getTmdbPersonTvCredits(topPerson.tmdbId);
    return NextResponse.json({ results: toRowMovies(credits), foundPerson: topPerson.name });
  }

  // 키워드 텍스트 검색: 시리즈 제목 + 배우/인물 병렬 조회
  let foundPersonName: string | null = null;
  const [titleResults, personResultsRaw] = await Promise.all([
    searchTmdbSeries(q),
    (async () => {
      const people = await searchTmdbPerson(q);
      if (people.length === 0) return { credits: [], name: null };
      const credits = await getTmdbPersonTvCredits(people[0].tmdbId);
      return { credits, name: people[0].name };
    })(),
  ]);

  const seen = new Set<string>();
  const merged: TmdbSeriesDetails[] = [];
  for (const s of [...titleResults, ...personResultsRaw.credits]) {
    if (!seen.has(s.tmdbId)) {
      seen.add(s.tmdbId);
      merged.push(s);
    }
  }

  if (titleResults.length === 0 && personResultsRaw.name) {
    foundPersonName = personResultsRaw.name;
  }

  return NextResponse.json({
    results: toRowMovies(merged),
    foundPerson: foundPersonName,
  });
}
