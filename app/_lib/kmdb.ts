// 한국영상자료원 KMDb 오픈API 연동 — KOBIS엔 없는 포스터/줄거리를 여기서 가져온다.
// KOBIS와는 별개 기관(한국영상자료원)·별개 키(KMDB_API_KEY)가 필요하다.
// 레거시 API라 http(https 아님), 응답은 JSON.
//
// 검색어 하나로 동명의 영화가 여러 편 잡히는 경우가 흔해서(예: "기생충" 검색 시
// 1968년 계몽영화, 2019년 봉준호 영화 등 25편), KOBIS에서 알아낸 개봉연도(prodYear)를
// 힌트로 넘겨 가장 가능성 높은 한 편을 고른다.

import { toChosung, isChosungOnly } from "./hangul";

// ── 외래어 표기 변형 정규화 ───────────────────────────────────────────────────
// 검색어와 DB 저장 이름 양쪽에 모두 적용해서 "앤소니/안소니", "쓰/스" 류를 흡수한다.
// 모음이 짧아서 비교할 글자 수가 적은 외래어 이름은 한 글자 차이로 아예 안 잡히기 때문에
// 정규화를 양방향으로 적용해 같은 canonical form으로 수렴시킨다.
function normalizePhoneme(text: string): string {
  return text
    .replace(/앤/g, "안")   // 앤서니→안서니, 앤더슨→안더슨
    .replace(/엔/g, "안")   // 엔드류→안드류
    .replace(/쓰/g, "스")   // 드림웍쓰→드림웍스
    .replace(/빼/g, "패")   // 빼트릭→패트릭
    .replace(/까/g, "카")   // 까뮈→카뮈
    .replace(/꾸/g, "쿠")
    .replace(/끄/g, "크")
    .replace(/쁘/g, "프");
}

// 검색어의 음소 변형을 최대 2개 생성한다.
// rawSearch를 여러 변형으로 병렬 실행할 때 사용한다.
function getPhonemeVariants(query: string): string[] {
  const variants = new Set<string>();
  // 앤↔안 (가장 흔한 쌍)
  if (query.includes("앤")) variants.add(query.replace(/앤/g, "안"));
  if (query.includes("안")) variants.add(query.replace(/안/g, "앤"));
  // 스↔쓰
  if (query.includes("쓰")) variants.add(query.replace(/쓰/g, "스"));
  // 정규화 결과와 같으면 제거 (중복 쿼리 방지)
  const normalized = normalizePhoneme(query);
  if (normalized !== query) variants.add(normalized);
  return Array.from(variants).filter((v) => v !== query);
}

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
// nameEn은 TMDB 검색용 — 톰 홀랜드/맷 데이먼 같은 외국 배우는 TMDB에 본명(영문)
// 으로만 등록돼 있어서, 한글 이름으로 검색하면 못 찾는다(movie-rate-info.ts,
// person-filmography.ts의 TMDB 인물 검색 참고).
export type KmdbPersonRef = { name: string; nameEn: string | null; kmdbId: string | null };
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
      ? { name: directorNm, nameEn: directorRaw?.directorEnNm?.trim() || null, kmdbId: directorRaw?.directorId?.trim() || null }
      : null,
    cast: (raw.actors?.actor ?? [])
      .filter((a) => a.actorNm?.trim())
      .slice(0, 20)
      .map((a) => ({
        name: stripHighlight(a.actorNm),
        nameEn: a.actorEnNm?.trim() || null,
        kmdbId: a.actorId?.trim() || null,
      })),
    genre: raw.genre?.trim() || null,
    isFeatureFilm: raw.type === "극영화",
  };
}

// KMDb는 레거시 http(https 아님) API라 keep-alive 소켓을 서버 쪽에서 갑자기 끊어버리는
// 경우("other side closed" SocketError)가 잦다. 새 연결로 재시도하면 대부분 바로
// 해결되므로, 네트워크 오류(HTTP 상태 코드가 아닌 fetch 자체의 실패)일 때만 짧게
// 재시도한다 — 존재하지 않는 데이터라 404 등이 온 경우는 재시도해도 소용없으므로 제외.
const RAW_SEARCH_MAX_ATTEMPTS = 3;

// fetch 자체엔 기본 타임아웃이 없어서, 연결이 에러 없이 그냥 응답 없이 멈춰버리면
// (실제로 이 네트워크에서 여러 번 있었다) 이 요청이 영원히 안 끝난다 — 그러면 아래
// KMDb 동시 요청 슬롯도 영원히 안 풀려서(finally를 못 타니까), 남은 슬롯이 하나둘
// 줄다가 결국 홈 화면 일부 줄이 영원히 로딩 중으로 멈춰버리는 문제로 이어진다.
// 일정 시간 안에 응답이 없으면 실패로 처리해서 재시도·슬롯 반납이 되게 한다.
const FETCH_TIMEOUT_MS = 10_000;

// 홈 화면처럼 한 요청 안에서 영화 수십~백 편의 메타데이터를 한꺼번에 조회하는
// 페이지는(첫 방문이라 캐시가 비어 있으면 특히) 동시에 수십~백 건의 KMDb 요청이
// 한꺼번에 나간다 — 실제로 이게 "other side closed" 소켓 오류가 몰려서 나는 원인
// 중 하나였다(레거시 서버가 그만큼의 동시 연결을 못 버팀). 그래서 이 앱 전체에서
// KMDb로 동시에 나가는 요청 개수를 여기서 하나로 제한한다 — 초과분은 큐에서
// 순서대로 기다렸다가 나간다. searchKmdbMovie 등 모든 KMDb 함수가 결국 이
// rawSearch를 거치므로, 호출부(movie-rows.ts 등) 하나하나를 손댈 필요 없이 여기
// 한 곳에서만 막으면 된다.
const KMDB_MAX_CONCURRENT_REQUESTS = 4;
let kmdbActiveRequests = 0;
const kmdbWaitQueue: Array<() => void> = [];

function acquireKmdbSlot(): Promise<void> {
  if (kmdbActiveRequests < KMDB_MAX_CONCURRENT_REQUESTS) {
    kmdbActiveRequests++;
    return Promise.resolve();
  }
  return new Promise((resolve) => kmdbWaitQueue.push(resolve));
}

function releaseKmdbSlot(): void {
  const next = kmdbWaitQueue.shift();
  if (next) {
    next(); // 대기 중이던 다음 요청이 이 슬롯을 그대로 이어받는다(활성 개수는 그대로).
  } else {
    kmdbActiveRequests--;
  }
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

  await acquireKmdbSlot();
  try {
    for (let attempt = 1; attempt <= RAW_SEARCH_MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
          next: { revalidate: 60 * 60 * 24 },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) {
          console.warn(`[kmdb] "${query}" 검색 실패: HTTP ${res.status}`);
          return [];
        }
        const data: { Data?: { Result?: RawKmdbResult[] }[] } = await res.json();
        return data.Data?.[0]?.Result ?? [];
      } catch (error) {
        if (attempt < RAW_SEARCH_MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
          continue;
        }
        console.warn(`[kmdb] "${query}" 요청 중 오류(재시도 ${RAW_SEARCH_MAX_ATTEMPTS}회 실패):`, error);
        return [];
      }
    }
    return [];
  } finally {
    releaseKmdbSlot();
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

// 제목이 같은 KMDb 레코드를 전부 찾는다 — 가장 가능성 높은 한 편만 고르는
// searchKmdbMovie와 달리, 동명이작 여부를 판정하려면(재개봉 판정 배치) 후보를 전부
// 모아 감독/배우/원제로 하나씩 대조해야 한다. 정규화 후 제목이 정확히 일치하는
// 레코드만 담는다(searchKmdbMovie의 fuzzy 폴백은 여기선 안 쓴다 — 동명이작 판정의
// 입력 자체가 애매해지면 안 된다).
export async function searchKmdbMoviesByTitle(title: string, titleEn?: string | null): Promise<KmdbMovieDetails[]> {
  const acceptableTitles = new Set([normalizeTitle(stripEdition(title)), normalizeTitle(title)]);
  if (titleEn) {
    acceptableTitles.add(normalizeTitle(stripEdition(titleEn)));
    acceptableTitles.add(normalizeTitle(titleEn));
  }

  const results = await rawSearch(stripEdition(title), 30);
  const pool = results.filter((r) => acceptableTitles.has(normalizeTitle(stripHighlight(r.title))));

  const deduped = new Map<string, RawKmdbResult>();
  for (const r of pool) {
    if (r.DOCID && !deduped.has(r.DOCID)) deduped.set(r.DOCID, r);
  }
  return Array.from(deduped.values())
    .map(toDetails)
    .filter((d): d is KmdbMovieDetails => d !== null);
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

  const byKorean = await rawSearch(stripEdition(title), 30);
  let best = pickBestMatch(byKorean, acceptableTitles, yearHint);

  if (!best && extra?.titleEn) {
    const byEnglish = await rawSearch(stripEdition(extra.titleEn), 30);
    best = pickBestMatch(byEnglish, acceptableTitles, yearHint);
  }

  if (!best && extra?.director) {
    const byDirector = await rawSearch(extra.director, 30);
    best = pickBestMatch(byDirector, acceptableTitles, yearHint);
  }

  // 출연진이 많은 앙상블 영화는 이름을 한 명씩 순서대로 검색하면 요청이 끝없이
  // 늘어날 수 있어서(실제로 이 폴백이 KMDb에 요청이 몰리는 원인 중 하나였다), 앞쪽
  // 몇 명(대체로 비중이 큰 순으로 등록됨)만 시도하고 그래도 못 찾으면 포기한다.
  const CAST_FALLBACK_LIMIT = 5;
  if (!best && extra?.cast) {
    for (const member of extra.cast.slice(0, CAST_FALLBACK_LIMIT)) {
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
//
// personId가 있으면 그 코드로만 매칭한다 — 예전엔 이름 일치도 같이 허용했었는데, "박정민"처럼
// 흔한 이름은 완전히 다른 무명 배우/단역이 같은 이름으로 KMDb에 따로 등록돼 있는 경우가 있어
// (실제 사례: "하루"/"군함도"/"메소드"/"왕을 참하라"에 다른 사람 "박정민"이 배우로 등록돼
// 있었고, 그 사람의 actorId는 우리가 찾는 배우 박정민의 kmdbId와 달랐다) 이름 일치를 허용하면
// 이런 동명이인의 작품이 필모그래피에 섞여 들어온다. personId가 없을 때만(코드 자체를 모를 때)
// 어쩔 수 없이 이름으로 매칭한다.
function creditsOf(
  r: RawKmdbResult,
  includeDirectors: boolean,
  includeActors: boolean
): { directors: RawKmdbDirector[]; actors: RawKmdbActor[] } {
  return {
    directors: includeDirectors ? (r.directors?.director ?? []) : [],
    actors: includeActors ? (r.actors?.actor ?? []) : [],
  };
}

export async function searchKmdbFilmography(
  personName: string,
  personId?: string | null,
  role?: "감독" | "배우" | null,
  nameEn?: string | null
): Promise<KmdbMovieDetails[]> {
  const results = await rawSearch(personName, 50);
  // 외국 배우는 한글 이름 검색과 병행해 영문 이름으로도 검색 — KMDb에 영문으로만
  // 등록돼 있거나 한글 이름 검색 결과에 이 인물의 작품이 충분히 안 걸리는 경우를 보완.
  const enResults = nameEn && nameEn !== personName ? await rawSearch(nameEn, 50) : [];
  const allResults = enResults.length > 0
    ? Array.from(new Map([...results, ...enResults].filter(r => r.DOCID).map(r => [r.DOCID!, r])).values())
    : results;
  if (allResults.length === 0) return [];

  const includeDirectors = role !== "배우";
  const includeActors = role !== "감독";

  let matched: RawKmdbResult[];

  if (personId) {
    // ID를 문자열로 트림해서 비교한다 — 어느 한쪽에 공백이 섞여 있거나 타입이 어긋나면
    // (예: 한쪽만 문자열) 비교가 항상 false가 되어 결과가 통째로 비어버리는데, 이 조용한
    // 실패를 원천적으로 없애기 위해 양쪽 다 명시적으로 String() 캐스팅해서 비교한다.
    const targetId = String(personId).trim();
    matched = allResults.filter((r) => {
      const { directors, actors } = creditsOf(r, includeDirectors, includeActors);
      return (
        directors.some((d) => d.directorId != null && String(d.directorId).trim() === targetId) ||
        actors.some((a) => a.actorId != null && String(a.actorId).trim() === targetId)
      );
    });
  } else {
    // 검색어가 이 사람 이름이면 KMDb가 이름 자체를 !HS...!HE로 감싸 돌려주므로, 비교 전에
    // 반드시 하이라이트 마커를 제거해야 한다 — 안 그러면 이 사람의 작품인데도 이름 비교가
    // 실패해서 필모그래피에서 누락된다.
    const normalizedName = normalizeTitle(personName);
    const normalizedNameEn = nameEn ? normalizeTitle(nameEn) : null;
    matched = allResults.filter((r) => {
      const { directors, actors } = creditsOf(r, includeDirectors, includeActors);
      return (
        directors.some((d) => {
          const n = normalizeTitle(stripHighlight(d.directorNm));
          return n === normalizedName || (normalizedNameEn && normalizeTitle(d.directorEnNm ?? "") === normalizedNameEn);
        }) ||
        actors.some((a) => {
          const n = normalizeTitle(stripHighlight(a.actorNm));
          return n === normalizedName || (normalizedNameEn && normalizeTitle(a.actorEnNm ?? "") === normalizedNameEn);
        })
      );
    });

    // 정확히 일치하는 항목이 하나도 없으면, 표기가 살짝 다른 경우(부가 표기, 띄어쓰기 등)에
    // 대비해 이름이 서로 포함 관계인 후보로 한 번 더 찾아본다 — 검색어 자체가 이 사람 이름이라
    // 완전 무관한 인물이 우연히 걸릴 위험은 낮다. 이때도 역할 범위는 그대로 유지한다.
    if (matched.length === 0 && normalizedName.length >= 2) {
      const nameMatches = (korName: string | undefined, enName: string | undefined) => {
        if (korName) {
          const n = normalizeTitle(stripHighlight(korName));
          if (n.length >= 2 && (n.includes(normalizedName) || normalizedName.includes(n))) return true;
        }
        if (normalizedNameEn && enName) {
          const n = normalizeTitle(enName);
          if (n.length >= 2 && (n.includes(normalizedNameEn) || normalizedNameEn.includes(n))) return true;
        }
        return false;
      };
      matched = allResults.filter((r) => {
        const { directors, actors } = creditsOf(r, includeDirectors, includeActors);
        return directors.some((d) => nameMatches(d.directorNm, d.directorEnNm)) || actors.some((a) => nameMatches(a.actorNm, a.actorEnNm));
      });
    }
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

export type KmdbPersonHit = {
  name: string;
  kmdbId: string;
  role: "감독" | "배우";
  // 이번 검색(최대 100건) 안에서 이 kmdbId로 credit이 몇 번 잡혔는지 — 동명이인을
  // 구분하는 보조 정보이자, "유령 후보"(우연히 한 번 스쳐 지나간 단역/오매칭)를
  // 걸러내는 근거로 쓴다. 생년월일 데이터가 없어도 계산 가능하다.
  creditCount: number;
  latestYear: string | null;
};

// 검색창 자동완성용 — 이름이 (한글이든 영문이든) 검색어를 포함하거나, 검색어가 초성이면
// 초성이 일치하는 감독/배우를 찾는다. KMDb의 query 검색은 영화 기준이라, 검색 결과에
// 등장하는 인물 중에서 이름이 일치하는 사람을 추려내는 방식이다. 배우/감독 이름을
// 영어로 검색해도(예: "Brad Pitt") 찾아지도록 한글(actorNm)과 영문(actorEnNm) 양쪽 다
// 확인한다. 단, 이 매칭은 KMDb가 해당 검색어로 돌려준 후보들 안에서만 이뤄지므로 —
// "브래드"처럼 KMDb 전문검색 자체가 관련 영화를 찾아주는 경우엔 잘 되지만, "ㅂㄹㄷㅍㅌ"
// 같은 순수 초성 검색어는 KMDb 검색엔진이 애초에 이해하지 못해 후보 자체가 안 잡힐 수
// 있다 — 그런 경우 이 초성 비교 로직까지 갈 후보 풀 자체가 비어 있게 된다.
export async function searchKmdbPeople(query: string, limit = 10): Promise<KmdbPersonHit[]> {
  // 음소 변형 쿼리와 원본을 병렬로 KMDb에 요청한다.
  // "앤소니 홉킨스" 입력 시 "안소니 홉킨스"로도 검색해 KMDb DB에 저장된 표기를 모두 잡는다.
  const variants = getPhonemeVariants(query);
  const [originalResults, ...variantResults] = await Promise.all([
    rawSearch(query, 50),
    ...variants.map((v) => rawSearch(v, 30)),
  ]);
  // DOCID 기준 중복 제거 후 합산
  const seenDocIds = new Set(originalResults.map((r) => r.DOCID));
  const results = [
    ...originalResults,
    ...variantResults.flat().filter((r) => !seenDocIds.has(r.DOCID)),
  ];
  if (results.length === 0) return [];

  const normalizedQuery = normalizeTitle(query);
  const normalizedQueryPhoneme = normalizeTitle(normalizePhoneme(query));
  const queryChosung = isChosungOnly(query) ? query.replace(/\s+/g, "") : null;
  // 키를 kmdbId 하나로만 두면, 같은 숫자 코드가 (드물게도) 감독 credit과 배우 credit
  // 양쪽에 다 등장할 때 둘이 하나로 합쳐져서 creditCount가 뒤섞이고 role은 먼저 잡힌
  // 쪽으로 고정돼버리는 문제가 실제로 확인됐다(안재홍 사례: 배우 00012168의 실제
  // 배우 credit이 엉뚱하게 다른 감독 코드의 감독 credit과 합산됨). role까지 키에
  // 포함해서 완전히 별개로 집계한다.
  const hits = new Map<string, { kmdbId: string; name: string; role: "감독" | "배우"; creditCount: number; latestYear: string | null }>();

  const matches = (korean?: string, english?: string) => {
    if (korean) {
      const normalizedKorean = normalizeTitle(korean);
      if (normalizedKorean.includes(normalizedQuery)) return true;
      // 음소 정규화 후 비교 — "앤소니"와 "안소니"를 같은 표기로 취급
      if (normalizeTitle(normalizePhoneme(korean)).includes(normalizedQueryPhoneme)) return true;
      if (queryChosung && toChosung(korean).includes(queryChosung)) return true;
    }
    if (english && normalizeTitle(english).includes(normalizedQuery)) return true;
    return false;
  };

  function bump(id: string, name: string, role: "감독" | "배우", prodYear: string | undefined) {
    const key = `${id}::${role}`;
    const existing = hits.get(key);
    if (existing) {
      existing.creditCount += 1;
      if (prodYear && (!existing.latestYear || prodYear > existing.latestYear)) existing.latestYear = prodYear;
    } else {
      hits.set(key, { kmdbId: id, name, role, creditCount: 1, latestYear: prodYear ?? null });
    }
  }

  for (const r of results) {
    for (const d of r.directors?.director ?? []) {
      if (!d.directorId || !d.directorNm) continue;
      const cleanName = stripHighlight(d.directorNm);
      if (matches(cleanName, d.directorEnNm)) bump(d.directorId, cleanName, "감독", r.prodYear);
    }
    for (const a of r.actors?.actor ?? []) {
      if (!a.actorId || !a.actorNm) continue;
      const cleanName = stripHighlight(a.actorNm);
      if (matches(cleanName, a.actorEnNm)) bump(a.actorId, cleanName, "배우", r.prodYear);
    }
  }

  const all: KmdbPersonHit[] = Array.from(hits.values()).map((v) => ({
    kmdbId: v.kmdbId,
    name: v.name,
    role: v.role,
    creditCount: v.creditCount,
    latestYear: v.latestYear,
  }));

  // 이름+역할이 완전히 같은 후보가 여럿(동명이인)일 때만, credit이 이 검색에서 딱 1번밖에
  // 안 잡힌 쪽을 "유령 후보"로 보고 뺀다 — 우연히 다른 사람 영화의 단역/오매칭으로 한 번
  // 스친 것일 위험이 크다. 후보가 하나뿐이면(동명이인이 아니면) credit이 1번이어도 그대로
  // 보여준다 — 검색어 자체가 이 사람 이름이라 신뢰할 수 있다.
  const groupKey = (h: KmdbPersonHit) => `${normalizeTitle(h.name)}::${h.role}`;
  const countByGroup = new Map<string, number>();
  for (const hit of all) countByGroup.set(groupKey(hit), (countByGroup.get(groupKey(hit)) ?? 0) + 1);

  const filtered = all.filter((hit) => (countByGroup.get(groupKey(hit)) ?? 0) === 1 || hit.creditCount >= 2);

  return filtered.sort((a, b) => b.creditCount - a.creditCount).slice(0, limit);
}

// 이 이름+역할로 실제 등록된(유령 후보 아닌) 서로 다른 kmdbId를 전부 찾는다 — 인물
// 페이지에서 "동명이인이 몇 명 있고, 지금 보는 사람이 그중 누구인지/다른 후보로
// 바꾸려면 어디로 가야 하는지"를 보여주는 데 쓴다. searchKmdbPeople의 유령 후보
// 필터링을 그대로 재사용한다.
export async function findNamesakeCandidates(name: string, role: "감독" | "배우"): Promise<KmdbPersonHit[]> {
  const hits = await searchKmdbPeople(name, 50);
  return hits.filter((h) => h.name === name && h.role === role);
}

// 이름만 있고 KMDb 인물 코드가 없는 경우(예: 이 영화가 KMDb에 없어서 KOBIS 정보로만
// 감독/출연진을 표시하는 경우)에, 이름으로 코드를 역으로 찾아 붙여준다. 한 번이라도
// 코드가 붙으면 그 뒤로는 인물 상세 페이지가 이름이 아니라 코드 기반으로 필모그래피를
// 조회하게 되어 동명이인이 섞이는 문제를 크게 줄인다. 다만 이 역조회 자체는 이름
// 매칭에 기대므로 완벽하진 않다 — 그래도 코드가 아예 없는 것보다는 훨씬 낫다.
//
// 주의: 이름+역할이 같은데 kmdbId가 서로 다른 후보가 여럿이면(완전히 다른 두 사람이
// 같은 이름을 쓰는 진짜 동명이인) 이 영화와 실제로 관련된 게 어느 쪽인지 판단할 근거가
// 기본적으로는 없다. 이럴 때 아무 후보나(예: 검색에서 먼저 걸린 유명한 쪽) 골라 코드를
// 붙이면, 그 사람과 무관한 이 영화가 그 사람의 필모그래피에 영구히(캐시로) 섞여 들어가는
// 잘못이 생긴다("박정민" 필모그래피에 실제로 출연하지 않은 영화가 다수 섞이던 원인이
// 이것이었다).
//
// contextYear(지금 이 인물을 찾게 된 영화의 개봉/제작연도)를 주면, 각 후보의 "활동
// 연도 범위"(그 kmdbId로 credit된 다른 영화들의 제작연도 최소~최대, 이름 검색 결과
// 안에서 계산)와 대조해서 그 시기에 실제로 활동한 후보 하나만 남는지 확인한다 —
// 생년월일 데이터 없이도 계산 가능한, 근거 있는 구분 방법이다. 그래도 유일하게
// 좁혀지지 않으면(범위가 겹치거나 아무도 안 맞으면) 여전히 포기한다 — 엉뚱한 사람과
// 잘못 연결하는 것보다 코드 없이 이름만 보여주는 쪽이 안전하다.
export async function resolvePersonId(
  name: string,
  role: "감독" | "배우",
  contextYear?: string | null
): Promise<string | null> {
  const results = await rawSearch(name, 50);
  if (results.length === 0) return null;

  const normalizedName = normalizeTitle(name);
  const candidates = new Map<string, { years: number[] }>();

  for (const r of results) {
    const prodYear = r.prodYear ? Number(r.prodYear) : null;
    const directors = role === "배우" ? [] : (r.directors?.director ?? []);
    const actors = role === "감독" ? [] : (r.actors?.actor ?? []);
    for (const d of directors) {
      if (d.directorId && normalizeTitle(stripHighlight(d.directorNm)) === normalizedName) {
        const c = candidates.get(d.directorId) ?? { years: [] };
        if (prodYear && !Number.isNaN(prodYear)) c.years.push(prodYear);
        candidates.set(d.directorId, c);
      }
    }
    for (const a of actors) {
      if (a.actorId && normalizeTitle(stripHighlight(a.actorNm)) === normalizedName) {
        const c = candidates.get(a.actorId) ?? { years: [] };
        if (prodYear && !Number.isNaN(prodYear)) c.years.push(prodYear);
        candidates.set(a.actorId, c);
      }
    }
  }

  const pool = Array.from(candidates.entries());
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0][0];

  if (contextYear) {
    const year = Number(contextYear);
    if (!Number.isNaN(year)) {
      const inRange = pool.filter(([, c]) => {
        if (c.years.length === 0) return false;
        return year >= Math.min(...c.years) - 2 && year <= Math.max(...c.years) + 2;
      });
      if (inRange.length === 1) return inRange[0][0];
    }
  }

  return null; // 0명이면 못 찾은 것, 2명 이상이고 문맥으로도 못 좁히면 진짜 동명이인 — 포기.
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
