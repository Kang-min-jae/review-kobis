// TMDB 공식 포스터/줄거리/크레딧/카탈로그 연동. API 키가 없거나 요청이 실패하면
// 조용히 빈 값을 반환해 호출부가 항상 자연스럽게 대체(그라디언트/빈 목록)되도록 한다.
// 출처 표기("This product uses the TMDB API...")는 app/layout.tsx 하단에 고정돼 있다.
// 포스터 다운로드 방지는 app/_components/PosterImage.tsx에서 처리한다.
//
// TMDB 계정 설정(themoviedb.org > Settings > API)에는 키가 두 종류 있다:
//   - API Key (v3 auth): 32자 정도의 짧은 문자열 → 쿼리스트링 ?api_key=
//   - API Read Access Token (v4 auth): "eyJ..."로 시작하는 긴 토큰 → Authorization: Bearer
// 둘 중 뭘 넣었는지 몰라도 되게, 형태를 보고 자동으로 맞는 방식을 골라 쓴다.

const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

// "10주년", "리마스터판", "확장판" 같은 재개봉/에디션 수식어를 검색어에서 제거해
// TMDB 원제 매칭률을 높인다. ("너의 이름은. 10주년" → "너의 이름은.")
const EDITION_SUFFIX_PATTERN =
  /\s*(\d+\s*주년(\s*(기념)?\s*(재개봉|특별판)?)?|리마스터(링)?판?|확장판|무삭제판|디렉터스\s*컷|극장판|스페셜\s*에디션)\s*/g;

function cleanTitleForSearch(title: string): string {
  return title.replace(EDITION_SUFFIX_PATTERN, " ").replace(/\s+/g, " ").trim();
}

function isV4ReadAccessToken(key: string): boolean {
  return key.startsWith("eyJ") || key.length > 60;
}

function authHeaders(apiKey: string, isV4: boolean): HeadersInit | undefined {
  return isV4 ? { Authorization: `Bearer ${apiKey}` } : undefined;
}

export type TmdbMovieSummary = {
  id: number;
  title: string;
  posterUrl: string | null;
  overview: string | null;
  popularity: number;
  voteAverage: number;
  voteCount: number;
  releaseDate: string | null;
};

export type TmdbPersonRef = { id: number; name: string };
export type TmdbCastMember = TmdbPersonRef & { character: string };

export type TmdbMovieDetails = TmdbMovieSummary & {
  director: TmdbPersonRef | null;
  cast: TmdbCastMember[];
};

type RawTmdbResult = {
  id: number;
  title?: string;
  original_title?: string;
  poster_path?: string | null;
  overview?: string | null;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  release_date?: string | null;
};

function toSummary(raw: RawTmdbResult): TmdbMovieSummary {
  return {
    id: raw.id,
    title: raw.title || raw.original_title || "제목 없음",
    posterUrl: raw.poster_path ? `${TMDB_IMAGE_BASE}${raw.poster_path}` : null,
    overview: raw.overview?.trim() || null,
    popularity: raw.popularity ?? 0,
    voteAverage: raw.vote_average ?? 0,
    voteCount: raw.vote_count ?? 0,
    releaseDate: raw.release_date || null,
  };
}

async function searchTmdbId(
  query: string,
  language: string,
  apiKey: string,
  isV4: boolean
): Promise<number | null> {
  const url = new URL(`${TMDB_API_BASE}/search/movie`);
  url.searchParams.set("query", query);
  url.searchParams.set("language", language);
  if (!isV4) url.searchParams.set("api_key", apiKey);

  const res = await fetch(url, {
    headers: authHeaders(apiKey, isV4),
    next: { revalidate: 60 * 60 * 24 },
  });

  if (!res.ok) {
    console.warn(
      `[tmdb] "${query}" (${language}) 검색 실패: HTTP ${res.status} (${isV4 ? "v4 Bearer 토큰" : "v3 api_key"} 방식) — 키가 올바른지 themoviedb.org에서 확인해 보세요.`
    );
    return null;
  }

  const data: { results?: RawTmdbResult[] } = await res.json();
  return data.results?.[0]?.id ?? null;
}

// 영화 상세정보 + 크레딧(감독/출연진)을 한 번에 가져온다. TMDB 영화 id로 정확히 단건 조회.
export async function getTmdbMovieDetails(tmdbId: number): Promise<TmdbMovieDetails | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;
  const isV4 = isV4ReadAccessToken(apiKey);

  const url = new URL(`${TMDB_API_BASE}/movie/${tmdbId}`);
  url.searchParams.set("language", "ko-KR");
  url.searchParams.set("append_to_response", "credits");
  if (!isV4) url.searchParams.set("api_key", apiKey);

  try {
    const res = await fetch(url, {
      headers: authHeaders(apiKey, isV4),
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) {
      console.warn(`[tmdb] movie/${tmdbId} 조회 실패: HTTP ${res.status}`);
      return null;
    }

    const data: RawTmdbResult & {
      credits?: {
        crew?: { id: number; name: string; job?: string }[];
        cast?: { id: number; name: string; character?: string }[];
      };
    } = await res.json();

    const directorEntry = data.credits?.crew?.find((c) => c.job === "Director");

    return {
      ...toSummary(data),
      director: directorEntry ? { id: directorEntry.id, name: directorEntry.name } : null,
      cast: (data.credits?.cast ?? []).slice(0, 6).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character ?? "",
      })),
    };
  } catch (error) {
    console.warn(`[tmdb] movie/${tmdbId} 요청 중 오류:`, error);
    return null;
  }
}

// 제목으로 검색해서 가장 근접한 매치의 상세정보(+크레딧)를 가져온다. 로컬 큐레이션
// 영화(현재 상영중/재개봉)처럼 TMDB id를 모를 때 사용.
export async function getTmdbMovieInfo(movie: {
  title: string;
  englishTitle?: string;
}): Promise<TmdbMovieDetails | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;
  const isV4 = isV4ReadAccessToken(apiKey);

  try {
    // 1순위: 정제한 한글 제목으로 한국어 매칭
    const koreanQuery = cleanTitleForSearch(movie.title);
    let id = await searchTmdbId(koreanQuery, "ko-KR", apiKey, isV4);

    // 2순위: 실패하면 영문(원어) 제목으로 재시도 — TMDB는 원제 매칭률이 더 높다
    if (!id) {
      const englishQuery = movie.englishTitle
        ? cleanTitleForSearch(movie.englishTitle)
        : koreanQuery;
      id = await searchTmdbId(englishQuery, "en-US", apiKey, isV4);
    }

    if (!id) {
      console.warn(`[tmdb] "${movie.title}"를 한글/영문 검색 모두에서 찾지 못했어요.`);
      return null;
    }

    return await getTmdbMovieDetails(id);
  } catch (error) {
    console.warn(`[tmdb] "${movie.title}" 요청 중 오류:`, error);
    return null;
  }
}

// discover/movie를 필요한 만큼 페이지네이션해서 가져온다 (한 페이지 20개, 최대 5페이지=100개로 제한).
export async function discoverMovies(
  params: Record<string, string>,
  maxResults: number
): Promise<TmdbMovieSummary[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return [];
  const isV4 = isV4ReadAccessToken(apiKey);
  const pagesNeeded = Math.min(Math.ceil(maxResults / 20), 5);
  const results: TmdbMovieSummary[] = [];

  for (let page = 1; page <= pagesNeeded; page++) {
    const url = new URL(`${TMDB_API_BASE}/discover/movie`);
    url.searchParams.set("language", "ko-KR");
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("page", String(page));
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    if (!isV4) url.searchParams.set("api_key", apiKey);

    try {
      const res = await fetch(url, {
        headers: authHeaders(apiKey, isV4),
        next: { revalidate: 60 * 60 * 6 },
      });
      if (!res.ok) {
        console.warn(`[tmdb] discover 실패: HTTP ${res.status} (page ${page}, ${url.search})`);
        break;
      }
      const data: { results?: RawTmdbResult[]; total_pages?: number } = await res.json();
      const pageResults = (data.results ?? []).map(toSummary);
      results.push(...pageResults);
      if (pageResults.length === 0 || page >= (data.total_pages ?? page)) break;
    } catch (error) {
      console.warn(`[tmdb] discover 요청 중 오류 (page ${page}):`, error);
      break;
    }
    if (results.length >= maxResults) break;
  }

  return results.slice(0, maxResults);
}

// "사용자 추천 영화" 중 아직 평가한 영화가 없는 사용자를 위한 폴백 — TMDB 주간 트렌딩.
export async function getTrendingMoviesWeek(limit: number): Promise<TmdbMovieSummary[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return [];
  const isV4 = isV4ReadAccessToken(apiKey);

  const url = new URL(`${TMDB_API_BASE}/trending/movie/week`);
  url.searchParams.set("language", "ko-KR");
  if (!isV4) url.searchParams.set("api_key", apiKey);

  try {
    const res = await fetch(url, {
      headers: authHeaders(apiKey, isV4),
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!res.ok) {
      console.warn(`[tmdb] trending 조회 실패: HTTP ${res.status}`);
      return [];
    }
    const data: { results?: RawTmdbResult[] } = await res.json();
    return (data.results ?? []).slice(0, limit).map(toSummary);
  } catch (error) {
    console.warn(`[tmdb] trending 요청 중 오류:`, error);
    return [];
  }
}

// 내가 높게 평가한 영화들(seedIds)을 시드로 TMDB의 movie/{id}/recommendations를 모아
// 여러 시드에서 겹쳐 추천되는 영화일수록 앞에 오도록 빈도순 정렬 (동률이면 인기도순).
// 이미 평가한 영화는 추천에서 제외한다.
export async function getMovieRecommendations(
  seedIds: number[],
  limit: number
): Promise<TmdbMovieSummary[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey || seedIds.length === 0) return [];
  const isV4 = isV4ReadAccessToken(apiKey);

  const seenSeeds = new Set(seedIds);
  const scored = new Map<number, { summary: TmdbMovieSummary; count: number }>();

  for (const seedId of seedIds) {
    const url = new URL(`${TMDB_API_BASE}/movie/${seedId}/recommendations`);
    url.searchParams.set("language", "ko-KR");
    if (!isV4) url.searchParams.set("api_key", apiKey);

    try {
      const res = await fetch(url, {
        headers: authHeaders(apiKey, isV4),
        next: { revalidate: 60 * 60 * 6 },
      });
      if (!res.ok) {
        console.warn(`[tmdb] movie/${seedId}/recommendations 실패: HTTP ${res.status}`);
        continue;
      }
      const data: { results?: RawTmdbResult[] } = await res.json();
      for (const raw of data.results ?? []) {
        if (seenSeeds.has(raw.id)) continue;
        const existing = scored.get(raw.id);
        if (existing) existing.count += 1;
        else scored.set(raw.id, { summary: toSummary(raw), count: 1 });
      }
    } catch (error) {
      console.warn(`[tmdb] movie/${seedId}/recommendations 요청 중 오류:`, error);
    }
  }

  return Array.from(scored.values())
    .sort((a, b) => b.count - a.count || b.summary.popularity - a.summary.popularity)
    .slice(0, limit)
    .map((entry) => entry.summary);
}

export type TmdbPersonFilmography = {
  name: string;
  profileUrl: string | null;
  movies: TmdbMovieSummary[];
};

// 감독/배우 상세 + 참여 작품 목록. 인물 프로필 페이지(/people/[id])에서 사용.
export async function getPersonFilmography(personId: number): Promise<TmdbPersonFilmography | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;
  const isV4 = isV4ReadAccessToken(apiKey);

  const url = new URL(`${TMDB_API_BASE}/person/${personId}`);
  url.searchParams.set("language", "ko-KR");
  url.searchParams.set("append_to_response", "movie_credits");
  if (!isV4) url.searchParams.set("api_key", apiKey);

  try {
    const res = await fetch(url, {
      headers: authHeaders(apiKey, isV4),
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) {
      console.warn(`[tmdb] person/${personId} 조회 실패: HTTP ${res.status}`);
      return null;
    }

    const data: {
      name?: string;
      profile_path?: string | null;
      movie_credits?: { cast?: RawTmdbResult[]; crew?: RawTmdbResult[] };
    } = await res.json();

    const byId = new Map<number, TmdbMovieSummary>();
    for (const item of data.movie_credits?.cast ?? []) {
      if (!byId.has(item.id)) byId.set(item.id, toSummary(item));
    }
    for (const item of data.movie_credits?.crew ?? []) {
      if (!byId.has(item.id)) byId.set(item.id, toSummary(item));
    }

    const movies = Array.from(byId.values()).sort((a, b) =>
      (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "")
    );

    return {
      name: data.name ?? "이름 없음",
      profileUrl: data.profile_path ? `${TMDB_IMAGE_BASE}${data.profile_path}` : null,
      movies,
    };
  } catch (error) {
    console.warn(`[tmdb] person/${personId} 요청 중 오류:`, error);
    return null;
  }
}

export type TmdbSearchHit = {
  id: number;
  title: string;
  posterUrl: string | null;
  releaseDate: string | null;
};

// 검색창용 — 1960년 이후 개봉작만 결과에 남긴다 (조건은 조용히 적용, UI에 노출하지 않음).
export async function searchMoviesSince1960(query: string): Promise<TmdbSearchHit[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return [];
  const isV4 = isV4ReadAccessToken(apiKey);

  const url = new URL(`${TMDB_API_BASE}/search/movie`);
  url.searchParams.set("query", query);
  url.searchParams.set("language", "ko-KR");
  url.searchParams.set("include_adult", "false");
  if (!isV4) url.searchParams.set("api_key", apiKey);

  try {
    const res = await fetch(url, { headers: authHeaders(apiKey, isV4) });
    if (!res.ok) {
      console.warn(`[tmdb] "${query}" 검색 실패: HTTP ${res.status}`);
      return [];
    }
    const data: { results?: RawTmdbResult[] } = await res.json();
    return (data.results ?? [])
      .filter((r) => r.release_date && Number(r.release_date.slice(0, 4)) >= 1960)
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        title: r.title || r.original_title || "제목 없음",
        posterUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
        releaseDate: r.release_date ?? null,
      }));
  } catch (error) {
    console.warn(`[tmdb] "${query}" 검색 요청 중 오류:`, error);
    return [];
  }
}
