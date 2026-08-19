// 한국영상자료원 KMDb 오픈API 연동 — KOBIS엔 없는 포스터/줄거리를 여기서 가져온다.
// KOBIS와는 별개 기관(한국영상자료원)·별개 키(KMDB_API_KEY)가 필요하다.
// 레거시 API라 http(https 아님), 응답은 JSON.
//
// 검색어 하나로 동명의 영화가 여러 편 잡히는 경우가 흔해서(예: "기생충" 검색 시
// 1968년 계몽영화, 2019년 봉준호 영화 등 25편), KOBIS에서 알아낸 개봉연도(prodYear)를
// 힌트로 넘겨 가장 가능성 높은 한 편을 고른다.

const KMDB_API_BASE =
  "http://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp";

function apiKey(): string | null {
  return process.env.KMDB_API_KEY || null;
}

// KMDb는 검색어와 일치하는 부분을 title에 "!HS"/"!HE"로 감싸서 돌려준다 — 제거해야 순수 제목이 된다.
function stripHighlight(title: string | undefined): string {
  return (title ?? "").replace(/!HS\s*/g, "").replace(/!HE\s*/g, "").trim();
}

function toIsoDate(yyyymmdd: string | undefined): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

type RawKmdbDirector = { directorNm?: string };
type RawKmdbActor = { actorNm?: string };
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

export type KmdbPersonRef = { name: string };
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
  const directorNm = raw.directors?.director?.[0]?.directorNm?.trim();

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
    director: directorNm ? { name: directorNm } : null,
    cast: (raw.actors?.actor ?? [])
      .map((a) => a.actorNm?.trim())
      .filter((name): name is string => Boolean(name))
      .slice(0, 6)
      .map((name) => ({ name })),
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

// 제목(+개봉연도 힌트)으로 가장 가능성 높은 한 편을 찾는다.
// 우선순위: 제목 일치 + 연도 일치 + 포스터 있음 > 제목 일치 + 연도 일치 >
//          제목 일치 + 포스터 있음 > 제목 일치 하나뿐.
// "호프"처럼 흔한 제목은 검색 결과에 전혀 다른 영화가 섞여 나올 수 있어서,
// 제목이 정확히 일치하는 후보가 하나도 없으면 엉뚱한 결과를 고르느니 그냥 포기한다
// (포스터 없이 그라디언트로 대체되는 쪽이 잘못된 포스터보다 안전하다).
export async function searchKmdbMovie(
  title: string,
  yearHint?: string | null
): Promise<KmdbMovieDetails | null> {
  const results = await rawSearch(title, 20);
  if (results.length === 0) return null;

  const pool = results
    .map((r) => ({ raw: r, cleanTitle: stripHighlight(r.title) }))
    .filter((c) => c.cleanTitle === title);
  if (pool.length === 0) return null; // 제목이 정확히 일치하는 후보가 없으면 포기한다.

  const withYear = yearHint ? pool.filter((c) => c.raw.prodYear === yearHint) : [];
  const withPoster = pool.filter((c) => c.raw.posters);

  const best =
    withYear.find((c) => c.raw.posters) ??
    withYear[0] ??
    (pool.length === 1 ? pool[0] : withPoster[0]) ??
    null;

  return best ? toDetails(best.raw) : null;
}

// 감독/배우 이름으로 참여작 목록을 찾는다. KMDb 검색은 제목 외 다른 필드도 매칭될 수 있어서,
// 실제로 그 이름이 감독/배우 목록에 있는 결과만 남긴다 (동명이인 오매칭 방지는 하지 않음 —
// KMDb 자체가 인물 고유 id로 구분해주지 않아서, 이름이 같으면 합쳐서 보여줄 수밖에 없다).
export async function searchKmdbFilmography(personName: string): Promise<KmdbMovieDetails[]> {
  const results = await rawSearch(personName, 50);
  if (results.length === 0) return [];

  const matched = results.filter((r) => {
    const directors = r.directors?.director?.map((d) => d.directorNm?.trim()) ?? [];
    const actors = r.actors?.actor?.map((a) => a.actorNm?.trim()) ?? [];
    return directors.includes(personName) || actors.includes(personName);
  });

  const deduped = new Map<string, RawKmdbResult>();
  for (const r of matched) {
    if (r.DOCID && !deduped.has(r.DOCID)) deduped.set(r.DOCID, r);
  }

  return Array.from(deduped.values())
    .map(toDetails)
    .filter((d): d is KmdbMovieDetails => d !== null)
    .sort((a, b) => (b.prodYear ?? "").localeCompare(a.prodYear ?? ""));
}
