import { NextResponse } from "next/server";
import {
  searchTmdbSeries,
  discoverTmdbSeriesByGenre,
  getTmdbPersonTvCredits,
  searchTmdbPerson,
  normalizeTitleStr,
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

  // 키워드 텍스트 검색: 시리즈 제목(3단계 폴백) + 배우/인물 병렬 조회
  let foundPersonName: string | null = null;
  const [rawTitleResults, personResultsRaw] = await Promise.all([
    // 1단계: ko-KR + en-US 병렬 검색 (searchTmdbSeries 내부에서 처리)
    searchTmdbSeries(q),
    (async () => {
      const people = await searchTmdbPerson(q);
      if (people.length === 0) return { credits: [], name: null };
      const credits = await getTmdbPersonTvCredits(people[0].tmdbId);
      return { credits, name: people[0].name };
    })(),
  ]);
  console.log(`[search-series] TMDB 1단계(ko+en) "${q}": ${rawTitleResults.length}건`);

  // 2단계: 클라이언트 측 느슨한 매칭 — 공백·특수문자를 제거해 비교
  // "밴드오브" → "밴드오브" ⊂ "밴드오브브라더스" 로 매칭
  const normalQ = normalizeTitleStr(q);
  let titleResults = rawTitleResults;
  if (normalQ.length >= 2) {
    const loose = rawTitleResults.filter((r) => {
      const n = normalizeTitleStr(r.name);
      const on = normalizeTitleStr(r.originalName ?? "");
      return n.includes(normalQ) || normalQ.includes(n) || on.includes(normalQ);
    });
    if (loose.length > 0 && loose.length < rawTitleResults.length) {
      console.log(`[search-series] 2단계 느슨한 매칭: ${rawTitleResults.length} → ${loose.length}건`);
      titleResults = loose;
    }
  }

  // 3단계: TMDB 결과가 전혀 없을 때 — 붙여쓴 쿼리에 공백을 삽입해 재시도
  // 예: "밴드오브"(4음절) → "밴드 오브"
  if (titleResults.length === 0 && normalQ.length >= 4 && !/\s/.test(q)) {
    const mid = Math.ceil(q.length / 2);
    const spacedQ = `${q.slice(0, mid)} ${q.slice(mid)}`;
    const fallbackResults = await searchTmdbSeries(spacedQ);
    console.log(`[search-series] 3단계 공백삽입 재시도 "${spacedQ}": ${fallbackResults.length}건`);
    if (fallbackResults.length > 0) titleResults = fallbackResults;
  }

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
