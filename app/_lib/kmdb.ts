// 한국영상자료원 KMDb 오픈API 연동 — KOBIS엔 없는 포스터/줄거리를 여기서 가져온다.
// KOBIS와는 별개 기관(한국영상자료원)·별개 키(KMDB_API_KEY)가 필요하다.
// 레거시 API라 http(https 아님), 응답은 JSON.
//
// 검색어 하나로 동명의 영화가 여러 편 잡히는 경우가 흔해서(예: "기생충" 검색 시
// 1968년 계몽영화, 2019년 봉준호 영화 등 25편), KOBIS에서 알아낸 개봉연도(prodYear)를
// 힌트로 넘겨 가장 가능성 높은 한 편을 고른다.

import { toChosung, isChosungOnly } from "./hangul";

const KMDB_API_BASE =
  "http://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp";

function apiKey(): string | null {
  return process.env.KMDB_API_KEY || null;
}

// KMDb는 검색어와 일치하는 부분을 title에 "!HS"/"!HE"로 감싸서 돌려준다 — 제거해야 순수 제목이 된다.
function stripHighlight(title: string | undefined): string {
  return (title ?? "").replace(/!HS\s*/g, "").replace(/!HE\s*/g, "").trim();
}

// KOBIS엔 "위커 맨: 파이널 컷", "백룡: 익스텐디드 컷"처럼 재개봉/에디션 수식어가 제목에
// 붙어 있는데, KMDb엔 보통 원제로만 등록돼 있어서 그대로 검색하면 못 찾는다. 검색 전에
// 이런 수식어를 떼어낸다.
const EDITION_SUFFIX_PATTERN =
  /\s*[:：]?\s*(\d+\s*주년(\s*(기념)?\s*(재개봉|특별판)?)?|리마스터(링)?판?|확장판|무삭제판|디렉터스\s*컷|파이널\s*컷|익스텐디드\s*컷|극장판|스페셜\s*에디션|언레이티드판?)\s*$/;

function stripEdition(title: string): string {
  return title.replace(EDITION_SUFFIX_PATTERN, "").trim();
}

// "아이스크림 맨" vs "아이스크림맨"처럼 KOBIS와 KMDb 사이에 띄어쓰기가 다르거나,
// "스파이더맨: 브랜드 뉴 데이"처럼 콜론·대시 등 특수문자 표기가 다른 경우가 흔해서,
// 제목을 비교할 땐 문자·숫자만 남기고 공백/특수문자는 모두 무시하며 대소문자도 가리지 않는다.
function normalizeTitle(title: string): string {
  return title.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

function toIsoDate(yyyymmdd: string | undefined): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

type RawKmdbDirector = { directorNm?: string; directorEnNm?: string; directorId?: string };
type RawKmdbActor = { actorNm?: string; actorEnNm?: string; actorId?: string };
type RawKmdbPlot = { plotLang?: string; plotText?: string };

type RawKmdbResult = {
  DOCID?: string;
  title?: string;
  titleEng?: string;
  prodYear?: string;
  directors?: { director?: RawKmdbDirector[] };
  actors?: { actor?: RawKmdbActor[] };
  nation?: string;
  plots?: { plot?: RawKmdbPlot[] };
  runtime?: string;
  rating?: string;
  genre?: string;
  type?: string;
  repRlsDate?: string;
  posters?: string;
  stlls?: string;
};

// kmdbId는 KMDb가 매기는 인물 고유 코드(예: "00001843") — 동명이인을 구분하는 데 쓴다.
export type KmdbPersonRef = { name: string; kmdbId: string | null };
export type KmdbCastMember = KmdbPersonRef;

export type KmdbMovieDetails = {
  docId: string;
  title: string;
  titleEng: string | null;
  prodYear: string | null;
  posterUrl: string | null;
  overview: string | null;
  releaseDate: string | null;
  runtimeMinutes: number | null;
  watchGrade: string | null;
  director: KmdbPersonRef | null;
  cast: KmdbCastMember[];
  genre: string | null;
  isFeatureFilm: boolean;
};

function toDetails(raw: RawKmdbResult): KmdbMovieDetails | null {
  if (!raw.DOCID || !raw.title) return null;

  const posters = raw.posters?.split("|").map((p) => p.trim()).filter(Boolean) ?? [];
  const koreanPlot = raw.plots?.plot?.find((p) => p.plotLang === "한국어") ?? raw.plots?.plot?.[0];
  const directorRaw = raw.directors?.director?.[0];
  const directorNm = stripHighlight(directorRaw?.directorNm) || null;

  return {
    docId: raw.DOCID,
    title: stripHighlight(raw.title),
    titleEng: raw.titleEng?.trim() || null,
    prodYear: raw.prodYear?.trim() || null,
    posterUrl: posters[0] ?? null,
    overview: koreanPlot?.plotText?.trim() || null,
    releaseDate: toIsoDate(raw.repRlsDate),
    runtimeMinutes: raw.runtime ? Number(raw.runtime) || null : null,
    watchGrade: raw.rating?.trim() || null,
    director: directorNm
      ? { name: directorNm, kmdbId: directorRaw?.directorId?.trim() || null }
      : null,
    cast: (raw.actors?.actor ?? [])
      .filter((a) => a.actorNm?.trim())
      .slice(0, 20)
      .map((a) => ({ name: stripHighlight(a.actorNm), kmdbId: a.actorId?.trim() || null })),
    genre: raw.genre?.trim() || null,
    isFeatureFilm: raw.type === "극영화",
  };
}

async function rawSearch(query: string, listCount: number): Promise<RawKmdbResult[]> {
  const key = apiKey();
  if (!key) return [];

  const url = new URL(KMDB_API_BASE);
  url.searchParams.set("collection", "kmdb_new2");
  url.searchParams.set("detail", "Y");
  url.searchParams.set("listCount", String(listCount));
  url.searchParams.set("ServiceKey", key);
  url.searchParams.set("query", query);

  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
    if (!res.ok) {
      console.warn(`[kmdb] "${query}" 검색 실패: HTTP ${res.status}`);
      return [];
    }
    const data: { Data?: { Result?: RawKmdbResult[] }[] } = await res.json();
    return data.Data?.[0]?.Result ?? [];
  } catch (error) {
    console.warn(`[kmdb] "${query}" 요청 중 오류:`, error);
    return [];
  }
}

// 검색 결과 중, 허용된 제목들(정규화됨) 중 하나와 정확히 일치하는 후보만 추려서 가장
// 가능성 높은 한 편을 고른다. 우선순위: 제목 일치 + 연도 일치 + 포스터 있음 >
// 제목 일치 + 연도 일치 > 제목 일치 + 포스터 있음 > 제목 일치 하나뿐.
// "호프"처럼 흔한 제목은 검색 결과에 전혀 다른 영화가 섞여 나올 수 있어서,
// 제목이 정확히 일치하는 후보가 하나도 없으면 엉뚱한 결과를 고르느니 그냥 포기한다
// (포스터 없이 그라디언트로 대체되는 쪽이 잘못된 포스터보다 안전하다).
function pickBestMatch(
  results: RawKmdbResult[],
  acceptableNormalizedTitles: Set<string>,
  yearHint?: string | null
): RawKmdbResult | null {
  const pool = results
    .map((r) => ({ raw: r, cleanTitle: stripHighlight(r.title) }))
    .filter((c) => acceptableNormalizedTitles.has(normalizeTitle(c.cleanTitle)));

  if (pool.length === 0) {
    // 정규화해도 제목이 정확히 일치하는 후보가 없으면, 제목이 부분적으로 겹치면서
    // 개봉연도까지 일치하는 후보를 대신 찾는다 — "아무 결과나" 고르는 게 아니라
    // 연도라는 근거가 확인될 때만 채택해서 엉뚱한 영화를 고르는 위험을 낮춘다.
    if (!yearHint) return null;
    const acceptable = Array.from(acceptableNormalizedTitles).filter((t) => t.length >= 2);
    const fuzzyPool = results
      .map((r) => ({ raw: r, cleanTitle: stripHighlight(r.title) }))
      .filter((c) => {
        if (c.raw.prodYear !== yearHint) return false;
        const normalized = normalizeTitle(c.cleanTitle);
        return acceptable.some((t) => normalized.includes(t) || t.includes(normalized));
      });
    if (fuzzyPool.length === 0) return null;
    const withPoster = fuzzyPool.find((c) => c.raw.posters);
    return (withPoster ?? fuzzyPool[0]).raw;
  }

  const withYear = yearHint ? pool.filter((c) => c.raw.prodYear === yearHint) : [];

  // 연도 힌트로도 못 정하면, 같은 제목의 후보 중 가장 먼저 나온(원 개봉) 쪽을 고른다 —
  // 재개봉판 등록이 있어도 항상 최초 개봉연도를 보여주기 위함. 그중 포스터 있는 쪽을 우선한다.
  const sortedByYear = [...pool].sort((a, b) =>
    (a.raw.prodYear ?? "9999").localeCompare(b.raw.prodYear ?? "9999")
  );
  const earliestWithPoster = sortedByYear.find((c) => c.raw.posters);

  const best =
    withYear.find((c) => c.raw.posters) ??
    withYear[0] ??
    (pool.length === 1 ? pool[0] : (earliestWithPoster ?? sortedByYear[0])) ??
    null;

  return best?.raw ?? null;
}

// 제목(+개봉연도 힌트)으로 가장 가능성 높은 한 편을 찾는다. 재개봉/에디션 수식어(파이널 컷,
// 10주년 등)는 떼고 검색한다 — KMDb엔 보통 원제로만 등록돼 있어서다.
// 한글 제목 검색으로 못 찾으면, 알려진 정보를 다른 경로로 하나씩 더 시도해서 어떻게든
// 찾아본다: (1) 영문 제목으로 재검색 — 외화는 KMDb·KOBIS의 한글 번역 표기가 다른 경우가
// 흔하다. (2) 그래도 못 찾으면 감독 이름으로 검색해서, 그 감독의 필모그래피 안에서 같은
// 제목의 작품을 찾는다 — 영화 자체가 제목 검색으로는 안 걸려도(등록 표기 차이 등) 감독/출연진
// 필모그래피 검색에는 걸리는 경우가 있다. 감독으로도 못 찾으면 출연진 이름을 한 명씩 더
// 시도한다. 채택 기준(pickBestMatch)은 제목이 정규화 후 정확히 일치하는 쪽을 우선하고,
// 그런 후보가 하나도 없으면 제목이 부분적으로 겹치면서 개봉연도까지 일치하는 후보로
// 대신한다 — 근거(연도) 없이 아무 결과나 집지는 않는다.
export async function searchKmdbMovie(
  title: string,
  yearHint?: string | null,
  extra?: { titleEn?: string | null; director?: string | null; cast?: string[] | null }
): Promise<KmdbMovieDetails | null> {
  const acceptableTitles = new Set([normalizeTitle(stripEdition(title)), normalizeTitle(title)]);
  if (extra?.titleEn) {
    acceptableTitles.add(normalizeTitle(stripEdition(extra.titleEn)));
    acceptableTitles.add(normalizeTitle(extra.titleEn));
  }

  const byKorean = await rawSearch(stripEdition(title), 50);
  let best = pickBestMatch(byKorean, acceptableTitles, yearHint);

  if (!best && extra?.titleEn) {
    const byEnglish = await rawSearch(stripEdition(extra.titleEn), 50);
    best = pickBestMatch(byEnglish, acceptableTitles, yearHint);
  }

  if (!best && extra?.director) {
    const byDirector = await rawSearch(extra.director, 50);
    best = pickBestMatch(byDirector, acceptableTitles, yearHint);
  }

  if (!best && extra?.cast) {
    for (const member of extra.cast) {
      const byCastMember = await rawSearch(member, 50);
      best = pickBestMatch(byCastMember, acceptableTitles, yearHint);
      if (best) break;
    }
  }

  return best ? toDetails(best) : null;
}

// 감독/배우 이름(+가능하면 KMDb 인물 코드, 역할)으로 참여작 목록을 찾는다.
// role을 주면 그 역할(감독/배우) 슬롯에서만 이름을 찾는다 — 그렇지 않으면 "톰 홀랜드"처럼
// 이름은 같지만 완전히 다른 두 사람(스파이더맨의 배우 vs 처키 시리즈의 감독)이 있을 때,
// 배우로 클릭해 들어왔는데도 그 이름이 감독으로 등록된 전혀 다른 영화까지 섞여 들어온다.
// personId가 있으면 우선 그 코드로 매칭해 동명이인을 확실히 구분하되, KMDb 인물 코드가
// 같은 사람에게 일관되게 붙어있지 않은 경우가 있어(오래된 아카이브 데이터의 흔한 문제)
// 이름이 정확히 일치하는 항목도 같이 포함한다 — 검색어 자체가 이 사람 이름이라 이름
// 일치만으로도 오매칭 위험은 낮다.
export async function searchKmdbFilmography(
  personName: string,
  personId?: string | null,
  role?: "감독" | "배우" | null
): Promise<KmdbMovieDetails[]> {
  const results = await rawSearch(personName, 100);
  if (results.length === 0) return [];

  const includeDirectors = role !== "배우";
  const includeActors = role !== "감독";

  const normalizedName = normalizeTitle(personName);
  let matched = results.filter((r) => {
    const directors = includeDirectors ? (r.directors?.director ?? []) : [];
    const actors = includeActors ? (r.actors?.actor ?? []) : [];
    const byId =
      !!personId &&
      (directors.some((d) => d.directorId === personId) || actors.some((a) => a.actorId === personId));
    // 검색어가 이 사람 이름이면 KMDb가 이름 자체를 !HS...!HE로 감싸 돌려주므로, 비교 전에
    // 반드시 하이라이트 마커를 제거해야 한다 — 안 그러면 이 사람의 작품인데도 이름 비교가
    // 실패해서 필모그래피에서 누락된다.
    const byName =
      directors.some((d) => normalizeTitle(stripHighlight(d.directorNm)) === normalizedName) ||
      actors.some((a) => normalizeTitle(stripHighlight(a.actorNm)) === normalizedName);
    return byId || byName;
  });

  // 정확히 일치하는 항목이 하나도 없으면, 표기가 살짝 다른 경우(부가 표기, 띄어쓰기 등)에
  // 대비해 이름이 서로 포함 관계인 후보로 한 번 더 찾아본다 — 검색어 자체가 이 사람 이름이라
  // 완전 무관한 인물이 우연히 걸릴 위험은 낮다. 이때도 역할 범위는 그대로 유지한다.
  if (matched.length === 0 && normalizedName.length >= 2) {
    const nameMatches = (raw: string | undefined) => {
      if (!raw) return false;
      const n = normalizeTitle(stripHighlight(raw));
      return n.length >= 2 && (n.includes(normalizedName) || normalizedName.includes(n));
    };
    matched = results.filter((r) => {
      const directors = includeDirectors ? (r.directors?.director ?? []) : [];
      const actors = includeActors ? (r.actors?.actor ?? []) : [];
      return directors.some((d) => nameMatches(d.directorNm)) || actors.some((a) => nameMatches(a.actorNm));
    });
  }

  const deduped = new Map<string, RawKmdbResult>();
  for (const r of matched) {
    if (r.DOCID && !deduped.has(r.DOCID)) deduped.set(r.DOCID, r);
  }

  return Array.from(deduped.values())
    .map(toDetails)
    .filter((d): d is KmdbMovieDetails => d !== null)
    .sort((a, b) => (b.prodYear ?? "").localeCompare(a.prodYear ?? ""));
}

export type KmdbPersonHit = { name: string; kmdbId: string; role: "감독" | "배우" };

// 검색창 자동완성용 — 이름이 (한글이든 영문이든) 검색어를 포함하거나, 검색어가 초성이면
// 초성이 일치하는 감독/배우를 찾는다. KMDb의 query 검색은 영화 기준이라, 검색 결과에
// 등장하는 인물 중에서 이름이 일치하는 사람을 추려내는 방식이다. 배우/감독 이름을
// 영어로 검색해도(예: "Brad Pitt") 찾아지도록 한글(actorNm)과 영문(actorEnNm) 양쪽 다
// 확인한다. 단, 이 매칭은 KMDb가 해당 검색어로 돌려준 후보들 안에서만 이뤄지므로 —
// "브래드"처럼 KMDb 전문검색 자체가 관련 영화를 찾아주는 경우엔 잘 되지만, "ㅂㄹㄷㅍㅌ"
// 같은 순수 초성 검색어는 KMDb 검색엔진이 애초에 이해하지 못해 후보 자체가 안 잡힐 수
// 있다 — 그런 경우 이 초성 비교 로직까지 갈 후보 풀 자체가 비어 있게 된다.
export async function searchKmdbPeople(query: string, limit = 10): Promise<KmdbPersonHit[]> {
  const results = await rawSearch(query, 30);
  if (results.length === 0) return [];

  const normalizedQuery = normalizeTitle(query);
  const queryChosung = isChosungOnly(query) ? query.replace(/\s+/g, "") : null;
  const hits = new Map<string, KmdbPersonHit>();

  const matches = (korean?: string, english?: string) => {
    if (korean) {
      if (normalizeTitle(korean).includes(normalizedQuery)) return true;
      if (queryChosung && toChosung(korean).includes(queryChosung)) return true;
    }
    if (english && normalizeTitle(english).includes(normalizedQuery)) return true;
    return false;
  };

  for (const r of results) {
    for (const d of r.directors?.director ?? []) {
      if (!d.directorId || !d.directorNm) continue;
      const cleanName = stripHighlight(d.directorNm);
      if (matches(cleanName, d.directorEnNm) && !hits.has(d.directorId)) {
        hits.set(d.directorId, { name: cleanName, kmdbId: d.directorId, role: "감독" });
      }
    }
    for (const a of r.actors?.actor ?? []) {
      if (!a.actorId || !a.actorNm) continue;
      const cleanName = stripHighlight(a.actorNm);
      if (matches(cleanName, a.actorEnNm) && !hits.has(a.actorId)) {
        hits.set(a.actorId, { name: cleanName, kmdbId: a.actorId, role: "배우" });
      }
    }
  }

  return Array.from(hits.values()).slice(0, limit);
}

// 이름만 있고 KMDb 인물 코드가 없는 경우(예: 이 영화가 KMDb에 없어서 KOBIS 정보로만
// 감독/출연진을 표시하는 경우)에, 이름으로 코드를 역으로 찾아 붙여준다. 한 번이라도
// 코드가 붙으면 그 뒤로는 인물 상세 페이지가 이름이 아니라 코드 기반으로 필모그래피를
// 조회하게 되어 동명이인이 섞이는 문제를 크게 줄인다. 다만 이 역조회 자체는 이름
// 매칭에 기대므로 완벽하진 않다 — 그래도 코드가 아예 없는 것보다는 훨씬 낫다.
export async function resolvePersonId(name: string, role: "감독" | "배우"): Promise<string | null> {
  const hits = await searchKmdbPeople(name, 10);
  if (hits.length === 0) return null;

  const normalizedName = normalizeTitle(name);
  const exact = hits.filter((h) => normalizeTitle(h.name) === normalizedName);
  const pool = exact.length > 0 ? exact : hits;
  // 같은 역할(감독/배우)의 후보만 채택한다 — 역할이 다른 동명이인의 코드를 잘못 붙이면
  // ("배우 톰 홀랜드"에 "감독 톰 홀랜드"의 코드가 붙는 식으로) 오히려 더 나쁘다.
  const sameRole = pool.find((h) => h.role === role);
  return sameRole?.kmdbId ?? null;
}

// 정확히 일치하는 검색 결과가 하나도 없을 때(주로 오타) 쓰는 "이런 뜻이었나요?" 제안.
// KMDb 전문검색(위즈넛 검색엔진)의 연관성 랭킹에 기대어, 가장 위에 온 결과의 제목을
// 후보로 돌려준다 — 완벽하지 않지만 약간의 오타는 흡수해 준다.
export async function suggestSimilarTitle(query: string): Promise<string | null> {
  const results = await rawSearch(query, 5);
  const first = results[0];
  if (!first?.title) return null;
  const clean = stripHighlight(first.title);
  return clean && normalizeTitle(clean) !== normalizeTitle(query) ? clean : null;
}
