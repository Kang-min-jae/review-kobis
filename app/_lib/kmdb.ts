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

// KOBIS엔 "위커 맨: 파이널 컷", "백룡: 익스텐디드 컷"처럼 재개봉/에디션 수식어가 제목에
// 붙어 있는데, KMDb엔 보통 원제로만 등록돼 있어서 그대로 검색하면 못 찾는다. 검색 전에
// 이런 수식어를 떼어낸다.
const EDITION_SUFFIX_PATTERN =
  /\s*[:：]?\s*(\d+\s*주년(\s*(기념)?\s*(재개봉|특별판)?)?|리마스터(링)?판?|확장판|무삭제판|디렉터스\s*컷|파이널\s*컷|익스텐디드\s*컷|극장판|스페셜\s*에디션|언레이티드판?)\s*$/;

function stripEdition(title: string): string {
  return title.replace(EDITION_SUFFIX_PATTERN, "").trim();
}

// "아이스크림 맨" vs "아이스크림맨"처럼 KOBIS와 KMDb 사이에 띄어쓰기가 다른 경우가
// 흔해서, 제목을 비교할 땐 공백을 무시하고 대소문자도 가리지 않는다.
function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, "").toLowerCase();
}

function toIsoDate(yyyymmdd: string | undefined): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

type RawKmdbDirector = { directorNm?: string; directorId?: string };
type RawKmdbActor = { actorNm?: string; actorId?: string };
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
  const directorNm = directorRaw?.directorNm?.trim();

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
      .slice(0, 6)
      .map((a) => ({ name: a.actorNm!.trim(), kmdbId: a.actorId?.trim() || null })),
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

// 제목(+개봉연도 힌트)으로 가장 가능성 높은 한 편을 찾는다. 재개봉/에디션 수식어(파이널 컷,
// 10주년 등)는 떼고 검색한다 — KMDb엔 보통 원제로만 등록돼 있어서다.
// 우선순위: 제목 일치 + 연도 일치 + 포스터 있음 > 제목 일치 + 연도 일치 >
//          제목 일치 + 포스터 있음 > 제목 일치 하나뿐.
// "호프"처럼 흔한 제목은 검색 결과에 전혀 다른 영화가 섞여 나올 수 있어서,
// 제목이 정확히 일치하는 후보가 하나도 없으면 엉뚱한 결과를 고르느니 그냥 포기한다
// (포스터 없이 그라디언트로 대체되는 쪽이 잘못된 포스터보다 안전하다).
export async function searchKmdbMovie(
  title: string,
  yearHint?: string | null
): Promise<KmdbMovieDetails | null> {
  const queryTitle = stripEdition(title);
  const results = await rawSearch(queryTitle, 20);
  if (results.length === 0) return null;

  const normalizedQuery = normalizeTitle(queryTitle);
  const normalizedTitle = normalizeTitle(title);
  const pool = results
    .map((r) => ({ raw: r, cleanTitle: stripHighlight(r.title) }))
    .filter((c) => {
      const normalized = normalizeTitle(c.cleanTitle);
      return normalized === normalizedQuery || normalized === normalizedTitle;
    });
  if (pool.length === 0) return null; // 제목이 정확히 일치하는 후보가 없으면 포기한다.

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

  return best ? toDetails(best.raw) : null;
}

// 감독/배우 이름(+가능하면 KMDb 인물 코드)으로 참여작 목록을 찾는다.
// personId를 넘기면 이름이 같아도 그 코드가 실제로 감독/배우 목록에 있는 항목만 남겨서
// 동명이인을 확실히 구분한다. personId가 없으면(직접 이름만 검색해 들어온 경우 등)
// 이름만으로 매칭하므로 동명이인이 섞일 수 있다.
export async function searchKmdbFilmography(
  personName: string,
  personId?: string | null
): Promise<KmdbMovieDetails[]> {
  const results = await rawSearch(personName, 50);
  if (results.length === 0) return [];

  const matched = results.filter((r) => {
    const directors = r.directors?.director ?? [];
    const actors = r.actors?.actor ?? [];
    if (personId) {
      return (
        directors.some((d) => d.directorId === personId) ||
        actors.some((a) => a.actorId === personId)
      );
    }
    const normalizedName = normalizeTitle(personName);
    return (
      directors.some((d) => normalizeTitle(d.directorNm ?? "") === normalizedName) ||
      actors.some((a) => normalizeTitle(a.actorNm ?? "") === normalizedName)
    );
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
