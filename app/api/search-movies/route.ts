import { NextResponse } from "next/server";
import { searchMoviesSince1960, searchKoficPeopleList, type KobisSearchHit } from "../../_lib/kobis";
import { searchKmdbPeople, searchKmdbFilmography, suggestSimilarTitle, type KmdbPersonHit } from "../../_lib/kmdb";
import { getMovieMeta } from "../../_lib/movie-rate-info";
import { db } from "../../_lib/db";

// 박스오피스 등 다른 목록과 똑같이 CachedMovie(lazy cache)를 거쳐 포스터를 붙인다 —
// KOBIS 카탈로그 검색 자체엔 포스터가 없어서(파일 상단 설명 참고), 그대로 두면
// 검색 드롭다운에만 포스터가 안 뜨는 지금 버그가 생긴다. 캐시가 없는(한 번도 안 본)
// 영화면 이 호출이 그 자리에서 KOBIS+KMDb를 조회해 캐시를 채운다 — 처음 검색될 땐
// 조금 느릴 수 있지만, 그 다음부턴 캐시로 바로 나간다.
async function withPosters(hits: KobisSearchHit[]): Promise<(KobisSearchHit & { posterUrl: string | null })[]> {
  return Promise.all(
    hits.map(async (hit) => ({ ...hit, posterUrl: (await getMovieMeta(hit.movieCd))?.posterUrl ?? null }))
  );
}

// KOFIC(KOBIS)의 별도 영화인 코드(peopleCd) 체계에서 대표작을 가져와 보조정보로
// 붙인다. KMDb kmdbId와 KOFIC peopleCd는 서로 다른 기관의 서로 다른 코드라 직접
// 매핑할 수 없어서, 이름으로 다시 조회한 뒤 "이 이름으로 KOFIC에도 정확히 한 명만
// 걸리는지"를 확인했을 때만 그 대표작을 붙인다 — KOFIC 쪽에도 동명이인이 있으면
// 어느 쪽 대표작인지 알 수 없어 그냥 비워둔다(잘못 붙이는 것보다 안전).
async function withRepresentativeWorks(
  people: KmdbPersonHit[]
): Promise<(KmdbPersonHit & { representativeWorks: string[] })[]> {
  return Promise.all(
    people.map(async (person) => {
      const koficHits = await searchKoficPeopleList(person.name);
      const sameName = koficHits.filter((h) => h.name === person.name);
      if (sameName.length !== 1) return { ...person, representativeWorks: [] };
      return { ...person, representativeWorks: sameName[0].filmoNames.slice(0, 3) };
    })
  );
}

// searchKmdbPeople은 KMDb 관련도순 텍스트검색(최대 100건) 안에서만 인물을 찾기
// 때문에, 그 사람의 실제 대표작들이 이 검색 텍스트("이름")로는 상위 100건 안에
// 하나도 안 걸리는 경우 검색 자체가 그 사람을 놓칠 수 있다 — 실제로 안재홍(진짜
// kmdbId=00012168)이 이 창으로는 전혀 안 잡히고, 대신 credit 몇 건짜리 동명이인만
// 잡히는 사례가 확인됐다. PersonIdentityMapping(사람이 직접 확인한 이름->kmdbId)에
// 등록된 인물이면, 검색 결과에 그 사람이 없거나(추가) 다른 코드로 잘못 잡혀 있으면
// (교체) 확정된 코드로 강제 보정한다 — 인물 상세페이지가 이미 이 매핑을 최우선으로
// 신뢰하는 것과 검색 결과를 일치시키기 위함이다.
async function withIdentityMappingOverride(people: KmdbPersonHit[], query: string): Promise<KmdbPersonHit[]> {
  const mappings = await db.personIdentityMapping.findMany();
  const matching = mappings.filter(
    (m) => m.kmdbId && (m.personName.includes(query) || query.includes(m.personName))
  );
  if (matching.length === 0) return people;

  let result = people;
  for (const mapping of matching) {
    const role = mapping.role as "감독" | "배우";
    const kmdbId = mapping.kmdbId!;
    const nameIdx = result.findIndex((p) => p.name === mapping.personName && p.role === role);
    if (nameIdx !== -1 && result[nameIdx].kmdbId === kmdbId) continue;

    // 확정된 kmdbId 기준으로 실제 참여작 수/최근작을 다시 계산한다 — searchKmdbPeople이
    // 이름 텍스트검색으로 잡아준 값을 그대로 못 쓰므로(애초에 그게 틀렸거나 아예 없어서
    // 이 보정이 필요한 상황이라) 999 같은 눈속임 값 대신 실제 근거 있는 값을 보여준다.
    const movies = await searchKmdbFilmography(mapping.personName, kmdbId, role);
    const years = movies.map((m) => m.prodYear).filter((y): y is string => !!y);
    const latestYear = years.length > 0 ? years.reduce((a, b) => (a > b ? a : b)) : null;
    const corrected: KmdbPersonHit = { name: mapping.personName, kmdbId, role, creditCount: movies.length, latestYear };

    // 이 kmdbId를 가진 항목이 이미 결과 안에 있으면(이름 표기가 살짝 다르거나
    // searchKmdbPeople이 이미 이 사람을 다른 이름으로 잡아둔 경우) 그 항목을
    // 교체한다 — 그렇지 않고 무조건 새로 추가하면 같은 kmdbId를 가진 항목이 두 번
    // 들어가서(React 목록 렌더링에서 key 중복 경고 + 화면에 같은 사람이 중복 표시)
    // 실제로 이런 사례가 있었다.
    const kmdbIdIdx = result.findIndex((p) => p.kmdbId === kmdbId && p.role === role);
    if (kmdbIdIdx !== -1) {
      result = result.map((p, i) => (i === kmdbIdIdx ? corrected : p));
    } else if (nameIdx !== -1) {
      result = result.map((p, i) => (i === nameIdx ? corrected : p));
    } else {
      result = [corrected, ...result];
    }
  }
  return result;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ movies: [], people: [], correctedQuery: null });
  }

  const [movieHits, rawPeople] = await Promise.all([
    searchMoviesSince1960(query),
    searchKmdbPeople(query, 8),
  ]);
  const people = await withIdentityMappingOverride(rawPeople, query);

  if (movieHits.length > 0 || people.length > 0) {
    const [movies, peopleWithWorks] = await Promise.all([withPosters(movieHits), withRepresentativeWorks(people)]);
    return NextResponse.json({ movies, people: peopleWithWorks, correctedQuery: null });
  }

  // 정확히 일치하는 결과가 없으면(오타 가능성), 비슷한 제목으로 한 번 더 찾아본다.
  const suggested = await suggestSimilarTitle(query);
  if (!suggested) {
    return NextResponse.json({ movies: [], people: [], correctedQuery: null });
  }

  const [correctedMovieHits, rawCorrectedPeople] = await Promise.all([
    searchMoviesSince1960(suggested),
    searchKmdbPeople(suggested, 8),
  ]);
  const correctedPeople = await withIdentityMappingOverride(rawCorrectedPeople, suggested);
  const found = correctedMovieHits.length > 0 || correctedPeople.length > 0;
  const [correctedMovies, correctedPeopleWithWorks] = await Promise.all([
    withPosters(correctedMovieHits),
    withRepresentativeWorks(correctedPeople),
  ]);

  return NextResponse.json({
    movies: correctedMovies,
    people: correctedPeopleWithWorks,
    correctedQuery: found ? suggested : null,
  });
}
