// TMDB(The Movie Database) 오픈API 연동 — KOBIS/KMDb 둘 다 이 영화를 못 찾거나
// 포스터가 없을 때 마지막 폴백으로 쓴다. 또한 인물(감독/배우) 필모그래피 조회에서
// person_id 기반 movie_credits 엔드포인트를 활용해 KMDb 텍스트 검색이 갖는 구조적
// 한계(관련도순 검색이라 credit이 있어도 결과에 아예 안 걸릴 수 있다 — 이 세션에서
// 실제로 "파수꾼" 박정민 사례로 확인됨)를 보완한다. TMDB는 인물 코드 하나로 그
// 사람의 "전체" 참여작을 한 번에 돌려줘서, 검색 결과 개수 제한 자체가 없다.
//
// v3 API Key 인증(쿼리파라미터 ?api_key=...)을 쓴다 — KOBIS/KMDb와 스타일을 맞췄고,
// 여기서 쓰는 엔드포인트(search/movie, movie 상세, search/person, person 상세,
// person movie_credits)는 전부 v3 키만으로 충분하다. Bearer(v4) 토큰이 필요한 건
// 리스트·평점 관련 기능뿐이라 이 기능엔 안 쓴다.
//
// 참고: 이 코드는 TMDB의 오래 안정적으로 유지돼 온 v3 응답 구조(공식 문서 기준)를
// 그대로 가정한다 — 이 샌드박스에선 실제 키로 라이브 호출해 응답을 확인할 방법이
// 없었으므로(TMDB_API_KEY 미발급), 실제 환경에서 첫 실행 시 필드명이 문서와 다르게
// 오면 알려달라.

const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

function apiKey(): string | null {
  return process.env.TMDB_API_KEY || null;
}

// KMDb/KOBIS와 같은 이유(응답 없이 멈추는 연결을 무한정 기다리지 않기 위해)로
// 타임아웃을 걸고, 네트워크 자체 실패는 짧게 재시도한다. TMDB는 공식적으로 엄격한
// 요청 제한을 문서화해두진 않지만(예전의 40건/10초 제한은 폐지됨), 그래도 짧은
// 시간에 동시 요청이 몰리지 않도록 이 앱 전체에서 동시 요청 개수를 제한한다 —
// kmdb.ts에 적용한 것과 같은 패턴이다.
const FETCH_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const MAX_CONCURRENT_REQUESTS = 4;

let activeRequests = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitQueue.push(resolve));
}

function releaseSlot(): void {
  const next = waitQueue.shift();
  if (next) {
    next(); // 대기 중이던 다음 요청이 이 슬롯을 그대로 이어받는다.
  } else {
    activeRequests--;
  }
}

async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {},
  lang = "ko-KR",
  noCache = false,
): Promise<T | null> {
  const key = apiKey();
  if (!key) return null;

  const url = new URL(`${TMDB_API_BASE}${path}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", lang);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  await acquireSlot();
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // noCache=true 일 때는 Next.js 데이터 캐시를 건너뛴다 — 서버 컴포넌트에서
        // TV 시리즈 엔드포인트를 호출할 때 실패 응답이 24h 동안 캐시되는 문제를 방지.
        const res = await fetch(url, {
          ...(noCache ? { cache: "no-store" } : { next: { revalidate: 60 * 60 * 24 } }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) {
          if (res.status === 429 && attempt < MAX_ATTEMPTS) {
            const retryAfterSec = parseInt(res.headers.get("Retry-After") ?? "1", 10);
            await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));
            continue;
          }
          console.warn(`[tmdb] ${path} 요청 실패: HTTP ${res.status}`);
          return null;
        }
        return (await res.json()) as T;
      } catch (error) {
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
          continue;
        }
        console.warn(`[tmdb] ${path} 요청 중 오류(재시도 ${MAX_ATTEMPTS}회 실패):`, error);
        return null;
      }
    }
    return null;
  } finally {
    releaseSlot();
  }
}

function toImageUrl(path: string | null | undefined): string | null {
  return path ? `${TMDB_IMAGE_BASE}${path}` : null;
}

function normalizeTitle(title: string): string {
  return title.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

// ── 영화 ──────────────────────────────────────────────────────────────────

type RawTmdbMovieSearchResult = {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string; // "YYYY-MM-DD" | ""
  poster_path?: string | null;
  overview?: string;
};

type RawTmdbGenre = { id: number; name: string };

type RawTmdbMovieDetails = {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
  runtime?: number | null;
  genres?: RawTmdbGenre[];
};

export type TmdbMovieDetails = {
  tmdbId: string;
  title: string;
  originalTitle: string | null;
  posterUrl: string | null;
  overview: string | null;
  releaseDate: string | null;
  runtimeMinutes: number | null;
  genre: string | null; // 콤마 구분 — KMDb/KOBIS의 genreAlt 형식과 맞춘다
};

// 검색 결과 중 제목(한국어/원어 둘 다 대조)이 정확히 일치하는 후보만 추리고,
// 연도 힌트가 있으면 그것까지 맞는 쪽을 우선한다 — 다른 소스들과 같은 원칙으로,
// 정확히 일치하는 후보가 하나도 없으면 엉뚱한 영화를 잘못 붙이느니 그냥 포기한다.
function pickBestMovieMatch(
  results: RawTmdbMovieSearchResult[],
  acceptableTitles: Set<string>,
  yearHint: string | null
): RawTmdbMovieSearchResult | null {
  const pool = results.filter((r) => {
    const t1 = r.title ? normalizeTitle(r.title) : null;
    const t2 = r.original_title ? normalizeTitle(r.original_title) : null;
    return (!!t1 && acceptableTitles.has(t1)) || (!!t2 && acceptableTitles.has(t2));
  });
  if (pool.length === 0) return null;
  if (!yearHint) return pool[0];

  const withYear = pool.filter((r) => r.release_date?.slice(0, 4) === yearHint);
  return withYear[0] ?? pool[0];
}

// 제목(+영문 제목, 개봉연도 힌트)으로 TMDB에서 영화를 찾는다. KOFIC/KMDb 둘 다
// 실패했거나 포스터가 없을 때만 호출되는 마지막 폴백이다. 장르 "이름"은 검색
// 응답엔 없고(genre_ids 숫자만 옴) 상세조회에만 있어서, 후보를 찾으면 상세조회를
// 한 번 더 해서 포스터·줄거리·러닝타임·장르를 전부 그 응답 기준으로 채운다.
export async function searchTmdbMovie(
  title: string,
  yearHint: string | null,
  titleEn?: string | null,
  locale: string = "ko"
): Promise<TmdbMovieDetails | null> {
  const lang = locale === "en" ? "en-US" : "ko-KR";
  const acceptableTitles = new Set([normalizeTitle(title)]);
  if (titleEn) acceptableTitles.add(normalizeTitle(titleEn));

  const data = await tmdbFetch<{ results?: RawTmdbMovieSearchResult[] }>("/search/movie", { query: title });
  let best = pickBestMovieMatch(data?.results ?? [], acceptableTitles, yearHint);

  // 한글 제목으로 못 찾으면 영문 제목으로 재시도한다 — 외화는 TMDB 한국어 등록
  // 표기가 KOBIS/KMDb와 다른 경우가 흔하다.
  if (!best && titleEn) {
    const dataEn = await tmdbFetch<{ results?: RawTmdbMovieSearchResult[] }>("/search/movie", { query: titleEn });
    best = pickBestMovieMatch(dataEn?.results ?? [], acceptableTitles, yearHint);
  }
  if (!best) return null;

  // 상세 조회는 locale에 맞는 언어로 — 제목·줄거리·장르가 locale 언어로 반환된다.
  const details = await tmdbFetch<RawTmdbMovieDetails>(`/movie/${best.id}`, {}, lang);
  if (!details) {
    return {
      tmdbId: String(best.id),
      title: best.title ?? title,
      originalTitle: null,
      posterUrl: toImageUrl(best.poster_path),
      overview: best.overview?.trim() || null,
      releaseDate: best.release_date?.trim() || null,
      runtimeMinutes: null,
      genre: null,
    };
  }

  return {
    tmdbId: String(details.id),
    title: details.title ?? best.title ?? title,
    originalTitle: details.original_title?.trim() || null,
    posterUrl: toImageUrl(details.poster_path),
    overview: details.overview?.trim() || null,
    releaseDate: details.release_date?.trim() || null,
    runtimeMinutes: details.runtime ?? null,
    genre: details.genres && details.genres.length > 0 ? details.genres.map((g) => g.name).join(",") : null,
  };
}

// TMDB ID를 이미 알고 있을 때 텍스트 검색 없이 바로 포스터만 가져온다
// (Wikidata P4947 프로퍼티로 얻은 TMDB ID 활용).
export async function getTmdbMoviePosterById(tmdbId: string): Promise<string | null> {
  const details = await tmdbFetch<RawTmdbMovieDetails>(`/movie/${tmdbId}`);
  return toImageUrl(details?.poster_path);
}

// TMDB ID로 영화 전체 상세 정보를 가져온다 — 수상작처럼 이미 tmdbId를 알고 있을 때
// 텍스트 검색 없이 바로 개요·런타임·장르·개봉일을 채우는 데 쓴다.
// lang 파라미터: 제목 검증용으로 "en-US"를 쓰면 영문 title + original_title을 돌려준다.
export async function getTmdbMovieDetailsById(tmdbId: string, lang = "ko-KR"): Promise<TmdbMovieDetails | null> {
  const details = await tmdbFetch<RawTmdbMovieDetails>(`/movie/${tmdbId}`, {}, lang);
  if (!details) return null;
  return {
    tmdbId: String(details.id),
    title: details.title ?? "",
    originalTitle: details.original_title?.trim() || null,
    posterUrl: toImageUrl(details.poster_path),
    overview: details.overview?.trim() || null,
    releaseDate: details.release_date?.trim() || null,
    runtimeMinutes: details.runtime ?? null,
    genre: details.genres && details.genres.length > 0 ? details.genres.map((g) => g.name).join(",") : null,
  };
}

// 수상작 포스터 전용 느슨한 검색 — 한/영 제목을 동시에 검색하고 제목 유사도를 검증해
// 엉뚱한 포스터가 매칭되는 것을 방지한다. titleAlt(보조 제목)가 있으면 병렬 검색.
export async function searchTmdbMoviePosterLoose(
  title: string,
  releaseYear: number,
  titleAlt?: string | null,
): Promise<string | null> {
  const normTitle = normalizeTitle(title);
  const normAlt = titleAlt ? normalizeTitle(titleAlt) : null;

  // TMDB 결과 제목과 검색 제목 둘 다 3자 이상일 때만 부분문자열 매칭을 허용.
  // 짧은 제목을 긴 제목의 부분으로 잘못 매칭하는 오탐을 방지한다.
  function isTitleMatch(r: RawTmdbMovieSearchResult, strict = false): boolean {
    if (!r.poster_path) return false;
    const t1 = r.title ? normalizeTitle(r.title) : "";
    const t2 = r.original_title ? normalizeTitle(r.original_title) : "";
    const matches = (norm: string) => {
      if (norm.length < 3) return false;
      if (strict) {
        // 연도 제약 없는 마지막 시도 — 제목이 정확히 동일하거나 포함 관계일 때만 허용.
        // 짧은 결과 제목이 긴 검색 쿼리에 포함되는 경우는 기각(오탐 방지).
        return (t1.length >= 3 && (t1 === norm || t1.includes(norm) || norm.includes(t1) && norm.length <= t1.length + 4)) ||
               (t2.length >= 3 && (t2 === norm || t2.includes(norm) || norm.includes(t2) && norm.length <= t2.length + 4));
      }
      return (t1.length >= 2 && (t1.includes(norm) || norm.includes(t1))) ||
             (t2.length >= 2 && (t2.includes(norm) || norm.includes(t2)));
    };
    return matches(normTitle) || (!!normAlt && matches(normAlt));
  }

  // 연도 범위 탐색 — 한/영 제목 병렬 검색 후 제목 유사도로 검증
  for (const year of [releaseYear, releaseYear - 1, releaseYear + 1]) {
    const queries: Promise<{ results?: RawTmdbMovieSearchResult[] } | null>[] = [
      tmdbFetch<{ results?: RawTmdbMovieSearchResult[] }>(
        "/search/movie", { query: title, primary_release_year: String(year) }, "en-US"
      ),
    ];
    if (titleAlt) {
      queries.push(
        tmdbFetch<{ results?: RawTmdbMovieSearchResult[] }>(
          "/search/movie", { query: titleAlt, primary_release_year: String(year) }, "ko-KR"
        )
      );
    }
    const datasets = await Promise.all(queries);
    const all = datasets.flatMap((d) => d?.results ?? []);
    const hit = all.find((r) => isTitleMatch(r, false));
    if (hit?.poster_path) return toImageUrl(hit.poster_path);
  }

  // 연도 제약 없는 마지막 시도 — 더 엄격한 제목 매칭 적용
  const queries: Promise<{ results?: RawTmdbMovieSearchResult[] } | null>[] = [
    tmdbFetch<{ results?: RawTmdbMovieSearchResult[] }>("/search/movie", { query: title }, "en-US"),
  ];
  if (titleAlt) {
    queries.push(
      tmdbFetch<{ results?: RawTmdbMovieSearchResult[] }>("/search/movie", { query: titleAlt }, "ko-KR")
    );
  }
  const datasets = await Promise.all(queries);
  const all = datasets.flatMap((d) => d?.results ?? []);
  const fallback = all.find((r) => isTitleMatch(r, true));
  return fallback?.poster_path ? toImageUrl(fallback.poster_path) : null;
}

// ── TV 시리즈 ──────────────────────────────────────────────────────────────

type RawTmdbTvSearchResult = {
  id: number;
  name?: string;
  original_name?: string;
  first_air_date?: string; // "YYYY-MM-DD" | ""
  poster_path?: string | null;
  overview?: string;
};

type RawTmdbTvDetails = {
  id: number;
  name?: string;
  original_name?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  number_of_seasons?: number | null;
  genres?: RawTmdbGenre[];
};

export type TmdbSeriesDetails = {
  tmdbId: string;
  name: string;
  originalName: string | null;
  posterUrl: string | null;
  overview: string | null;
  firstAirDate: string | null;
  seasonCount: number | null;
  genre: string | null; // 콤마 구분
};

export async function getTmdbSeriesDetails(tmdbId: string, locale: string = "ko"): Promise<TmdbSeriesDetails | null> {
  const lang = locale === "en" ? "en-US" : "ko-KR";
  const details = await tmdbFetch<RawTmdbTvDetails>(`/tv/${tmdbId}`, {}, lang, true);
  if (!details) return null;
  return {
    tmdbId: String(details.id),
    name: details.name ?? "",
    originalName: details.original_name?.trim() || null,
    posterUrl: toImageUrl(details.poster_path),
    overview: details.overview?.trim() || null,
    firstAirDate: details.first_air_date?.trim() || null,
    seasonCount: details.number_of_seasons ?? null,
    genre: details.genres && details.genres.length > 0 ? details.genres.map((g) => g.name).join(",") : null,
  };
}

function rawToSeriesDetails(r: RawTmdbTvSearchResult): TmdbSeriesDetails {
  return {
    tmdbId: String(r.id),
    name: r.name ?? r.original_name ?? "",
    originalName: r.original_name?.trim() || null,
    posterUrl: toImageUrl(r.poster_path),
    overview: r.overview?.trim() || null,
    firstAirDate: r.first_air_date?.trim() || null,
    seasonCount: null,
    genre: null,
  };
}

// 한국어·영어 두 로케일로 동시에 검색해 결과를 합친다.
// TMDB search는 질의어가 어떤 언어든 검색하지만 language 파라미터가 반환 제목에 영향을 주므로,
// 두 로케일을 병렬 요청해 tmdbId 기준으로 중복 제거하면 한글/영문 제목 모두 잡힌다.
export async function searchTmdbSeries(query: string): Promise<TmdbSeriesDetails[]> {
  const [koData, enData] = await Promise.all([
    tmdbFetch<{ results?: RawTmdbTvSearchResult[] }>("/search/tv", { query }, "ko-KR"),
    tmdbFetch<{ results?: RawTmdbTvSearchResult[] }>("/search/tv", { query }, "en-US"),
  ]);

  const seen = new Set<string>();
  const merged: TmdbSeriesDetails[] = [];
  for (const r of [...(koData?.results ?? []), ...(enData?.results ?? [])]) {
    if (!(r.name || r.original_name)) continue;
    const id = String(r.id);
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(rawToSeriesDetails(r));
    }
  }
  return merged.slice(0, 20);
}

// 공백·특수문자를 제거한 소문자 문자열 — 느슨한 제목 매칭에 사용
export function normalizeTitleStr(s: string): string {
  return s.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

// ── 통합 검색 (/search/multi) ─────────────────────────────────────────────────

type RawTmdbMultiResult = {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  original_name?: string;
  original_title?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
};

export type TmdbMultiHit = {
  tmdbId: string;
  mediaType: "movie" | "tv";
  title: string;
  year: string | null;
  posterUrl: string | null;
};

// 한국어·영어 두 로케일 병렬 요청 후 tmdbId+mediaType 기준 중복 제거.
// person 결과는 제외하고 movie·tv만 반환한다.
export async function searchTmdbMulti(query: string): Promise<TmdbMultiHit[]> {
  const [koData, enData] = await Promise.all([
    tmdbFetch<{ results?: RawTmdbMultiResult[] }>("/search/multi", { query, include_adult: "false" }, "ko-KR"),
    tmdbFetch<{ results?: RawTmdbMultiResult[] }>("/search/multi", { query, include_adult: "false" }, "en-US"),
  ]);

  const seen = new Set<string>();
  const merged: TmdbMultiHit[] = [];

  for (const r of [...(koData?.results ?? []), ...(enData?.results ?? [])]) {
    if (r.media_type === "person") continue;
    const key = `${r.media_type}-${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const isMovie = r.media_type === "movie";
    merged.push({
      tmdbId: String(r.id),
      mediaType: r.media_type as "movie" | "tv",
      title: isMovie ? (r.title ?? r.original_title ?? "") : (r.name ?? r.original_name ?? ""),
      year: isMovie ? (r.release_date?.slice(0, 4) ?? null) : (r.first_air_date?.slice(0, 4) ?? null),
      posterUrl: toImageUrl(r.poster_path),
    });
  }

  return merged.slice(0, 20);
}

export async function getTmdbPopularSeries(): Promise<TmdbSeriesDetails[]> {
  const data = await tmdbFetch<{ results?: RawTmdbTvSearchResult[] }>("/tv/popular", {}, "ko-KR", true);
  return (data?.results ?? [])
    .filter((r) => r.name || r.original_name)
    .slice(0, 20)
    .map(rawToSeriesDetails);
}

// TMDB TV 장르 ID 매핑
const TV_GENRE_IDS: Record<string, string> = {
  "드라마": "18",
  "액션": "10759",
  "코미디": "35",
  "범죄": "80",
  "SF": "10765",
  "판타지": "10765",
  "미스터리": "9648",
  "다큐멘터리": "99",
  "전쟁": "10768",
};

export async function discoverTmdbSeriesByGenre(genre: string): Promise<TmdbSeriesDetails[]> {
  const genreId = TV_GENRE_IDS[genre];
  let data: { results?: RawTmdbTvSearchResult[] } | null;
  if (genreId) {
    data = await tmdbFetch<{ results?: RawTmdbTvSearchResult[] }>("/discover/tv", {
      with_genres: genreId,
      sort_by: "popularity.desc",
    });
  } else {
    data = await tmdbFetch<{ results?: RawTmdbTvSearchResult[] }>("/search/tv", { query: genre });
  }
  return (data?.results ?? [])
    .filter((r) => r.name || r.original_name)
    .slice(0, 20)
    .map(rawToSeriesDetails);
}

type RawTmdbTvCredit = {
  id: number;
  name?: string;
  original_name?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
};

export async function getTmdbPersonTvCredits(personId: string): Promise<TmdbSeriesDetails[]> {
  const data = await tmdbFetch<{ cast?: RawTmdbTvCredit[]; crew?: RawTmdbTvCredit[] }>(
    `/person/${personId}/tv_credits`
  );
  const all = [...(data?.cast ?? []), ...(data?.crew ?? [])];
  const deduped = new Map<number, RawTmdbTvCredit>();
  for (const c of all) {
    if ((c.name || c.original_name) && !deduped.has(c.id)) deduped.set(c.id, c);
  }
  return Array.from(deduped.values())
    .filter((c) => c.poster_path)
    .slice(0, 20)
    .map((c) => ({
      tmdbId: String(c.id),
      name: c.name ?? c.original_name ?? "",
      originalName: c.original_name?.trim() || null,
      posterUrl: toImageUrl(c.poster_path),
      overview: c.overview?.trim() || null,
      firstAirDate: c.first_air_date?.trim() || null,
      seasonCount: null,
      genre: null,
    }));
}

// ── 인물 ──────────────────────────────────────────────────────────────────

type RawTmdbPersonSearchResult = {
  id: number;
  name?: string;
  profile_path?: string | null;
};

export type TmdbPersonHit = {
  tmdbId: string;
  name: string;
  profileUrl: string | null;
};

export async function searchTmdbPerson(name: string): Promise<TmdbPersonHit[]> {
  const data = await tmdbFetch<{ results?: RawTmdbPersonSearchResult[] }>("/search/person", { query: name });
  return (data?.results ?? [])
    .filter((r) => r.name)
    .map((r) => ({ tmdbId: String(r.id), name: r.name!, profileUrl: toImageUrl(r.profile_path) }));
}

async function findExactPersonMatch(name: string): Promise<string | null> {
  const candidates = await searchTmdbPerson(name);
  const sameName = candidates.filter((c) => c.name === name);
  return sameName.length === 1 ? sameName[0].tmdbId : null;
}

// 이름으로 TMDB person_id를 찾는다 — 검색 결과 중 이름이 정확히 같은 후보가
// 하나로 좁혀질 때만 채택하고, 동명이인이 여럿이면 근거 없이 아무나 고르지 않고
// 포기한다(이 코드베이스의 다른 동명이인 처리와 같은 원칙). 영화 캐스트의 tmdbId
// 역조회, 인물 필모그래피 조회 양쪽에서 재사용한다.
//
// 톰 홀랜드·맷 데이먼 같은 외국 배우는 TMDB에 본명(영문)으로만 등록돼 있어서,
// KOBIS/KMDb에서 얻은 한글 이름으로 검색하면 아예 못 찾는다 — 한글로 못 찾으면
// 영문 이름(nameEn, KMDb의 actorEnNm/directorEnNm)으로 재시도한다. 영문 이름이
// 없으면(한국 인물 등) 한글 결과만으로 판단한다.
export async function resolveTmdbPersonIdByName(name: string, nameEn?: string | null): Promise<string | null> {
  const byKorean = await findExactPersonMatch(name);
  if (byKorean) return byKorean;
  if (nameEn) return findExactPersonMatch(nameEn);
  return null;
}

type RawTmdbPersonDetails = {
  id: number;
  name?: string;
  birthday?: string | null; // "YYYY-MM-DD" | null(비공개/미확인)
};

// 동명이인 후보를 구분하는 "참고 정보"로 생년월일을 보여주기 위한 조회 — KMDb엔
// 이 정보가 아예 없어서 TMDB로만 보완할 수 있다. 확정 판정 근거로 쓰진 않는다
// (TMDB 인물과 KMDb 인물을 이름만으로 이어붙인 것이라, 그 자체가 완전히 정확한
// 동일인 매칭이라는 보장은 없다 — 어디까지나 사람이 참고할 힌트).
export async function getTmdbPersonBirthday(tmdbId: string): Promise<string | null> {
  const data = await tmdbFetch<RawTmdbPersonDetails>(`/person/${tmdbId}`);
  return data?.birthday?.trim() || null;
}

type RawTmdbCreditMovie = {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  job?: string; // crew 항목에만 있음(예: "Director")
};

export type TmdbCreditMovie = {
  tmdbId: string;
  title: string;
  originalTitle: string | null;
  posterUrl: string | null;
  releaseDate: string | null;
};

// person_id 하나로 이 사람의 "전체" 영화 참여작을 한 번에 돌려준다 — KMDb의 텍스트
// 검색(관련도순, 최대 100건)과 달리 검색 결과 누락이 구조적으로 없다(전수 조회).
// role이 "감독"이면 crew 중 job이 "Director"인 것만, "배우"면 cast 전부, 모르면
// 둘 다 합친다.
export async function getTmdbPersonMovieCredits(
  tmdbId: string,
  role: "감독" | "배우" | null
): Promise<TmdbCreditMovie[]> {
  const data = await tmdbFetch<{ cast?: RawTmdbCreditMovie[]; crew?: RawTmdbCreditMovie[] }>(
    `/person/${tmdbId}/movie_credits`
  );
  if (!data) return [];

  const raw: RawTmdbCreditMovie[] =
    role === "감독"
      ? (data.crew ?? []).filter((c) => c.job === "Director")
      : role === "배우"
        ? (data.cast ?? [])
        : [...(data.cast ?? []), ...(data.crew ?? []).filter((c) => c.job === "Director")];

  const deduped = new Map<number, RawTmdbCreditMovie>();
  for (const c of raw) {
    if (c.title && !deduped.has(c.id)) deduped.set(c.id, c);
  }

  return Array.from(deduped.values()).map((c) => ({
    tmdbId: String(c.id),
    title: c.title!,
    originalTitle: c.original_title?.trim() || null,
    posterUrl: toImageUrl(c.poster_path),
    releaseDate: c.release_date?.trim() || null,
  }));
}
