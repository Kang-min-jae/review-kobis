// TMDB 공식 포스터/줄거리 연동. API 키가 없거나 요청이 실패하면 조용히 null을 반환해
// 호출부가 항상 그라디언트+목데이터 설명으로 자연스럽게 대체되도록 한다.
// 출처 표기("This product uses the TMDB API...")는 app/layout.tsx 하단에 고정돼 있다.
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

export type TmdbMovieInfo = {
  posterUrl: string | null;
  overview: string | null;
};

async function searchTmdb(
  query: string,
  language: string,
  apiKey: string,
  isV4: boolean
): Promise<TmdbMovieInfo | null> {
  const url = new URL(`${TMDB_API_BASE}/search/movie`);
  url.searchParams.set("query", query);
  url.searchParams.set("language", language);
  if (!isV4) url.searchParams.set("api_key", apiKey);

  const res = await fetch(url, {
    headers: isV4 ? { Authorization: `Bearer ${apiKey}` } : undefined,
    next: { revalidate: 60 * 60 * 24 },
  });

  if (!res.ok) {
    console.warn(
      `[tmdb] "${query}" (${language}) 검색 실패: HTTP ${res.status} (${isV4 ? "v4 Bearer 토큰" : "v3 api_key"} 방식) — 키가 올바른지 themoviedb.org에서 확인해 보세요.`
    );
    return null;
  }

  const data: { results?: { poster_path?: string | null; overview?: string | null }[] } =
    await res.json();
  const result = data.results?.[0];
  if (!result) return null;

  return {
    posterUrl: result.poster_path ? `${TMDB_IMAGE_BASE}${result.poster_path}` : null,
    overview: result.overview?.trim() || null,
  };
}

export async function getTmdbMovieInfo(movie: {
  title: string;
  englishTitle?: string;
}): Promise<TmdbMovieInfo | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const isV4 = isV4ReadAccessToken(apiKey);

  try {
    // 1순위: 정제한 한글 제목으로 한국어 매칭
    const koreanQuery = cleanTitleForSearch(movie.title);
    const koreanResult = await searchTmdb(koreanQuery, "ko-KR", apiKey, isV4);
    if (koreanResult) return koreanResult;

    // 2순위: 실패하면 영문(원어) 제목으로 재시도 — TMDB는 원제 매칭률이 더 높다
    const englishQuery = movie.englishTitle
      ? cleanTitleForSearch(movie.englishTitle)
      : koreanQuery;
    const englishResult = await searchTmdb(englishQuery, "en-US", apiKey, isV4);
    if (englishResult) return englishResult;

    console.warn(`[tmdb] "${movie.title}"를 한글/영문 검색 모두에서 찾지 못했어요.`);
    return null;
  } catch (error) {
    console.warn(`[tmdb] "${movie.title}" 요청 중 오류:`, error);
    return null;
  }
}
