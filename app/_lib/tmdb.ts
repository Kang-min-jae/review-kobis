// TMDB 공식 포스터 연동. API 키가 없거나 요청이 실패하면 조용히 null을 반환해
// 호출부(MovieCard)가 항상 그라디언트 플레이스홀더로 자연스럽게 대체되도록 한다.
// 출처 표기("This product uses the TMDB API...")는 app/layout.tsx 하단에 고정돼 있다.
//
// TMDB 계정 설정(themoviedb.org > Settings > API)에는 키가 두 종류 있다:
//   - API Key (v3 auth): 32자 정도의 짧은 문자열 → 쿼리스트링 ?api_key=
//   - API Read Access Token (v4 auth): "eyJ..."로 시작하는 긴 토큰 → Authorization: Bearer
// 둘 중 뭘 넣었는지 몰라도 되게, 형태를 보고 자동으로 맞는 방식을 골라 쓴다.

const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

function isV4ReadAccessToken(key: string): boolean {
  return key.startsWith("eyJ") || key.length > 60;
}

export async function getTmdbPosterUrl(title: string): Promise<string | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const isV4 = isV4ReadAccessToken(apiKey);
  const url = new URL(`${TMDB_API_BASE}/search/movie`);
  url.searchParams.set("query", title);
  url.searchParams.set("language", "ko-KR");
  if (!isV4) url.searchParams.set("api_key", apiKey);

  try {
    const res = await fetch(url, {
      headers: isV4 ? { Authorization: `Bearer ${apiKey}` } : undefined,
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!res.ok) {
      console.warn(
        `[tmdb] "${title}" 검색 실패: HTTP ${res.status} (${isV4 ? "v4 Bearer 토큰" : "v3 api_key"} 방식 사용) — 키가 올바른지 themoviedb.org에서 확인해 보세요.`
      );
      return null;
    }

    const data: { results?: { poster_path?: string | null }[] } = await res.json();
    const posterPath = data.results?.[0]?.poster_path;
    if (!posterPath) {
      console.warn(`[tmdb] "${title}"에 대한 검색 결과가 없어요 (TMDB에 없는 제목일 수 있음).`);
    }
    return posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : null;
  } catch (error) {
    console.warn(`[tmdb] "${title}" 요청 중 오류:`, error);
    return null;
  }
}
