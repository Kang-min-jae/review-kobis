// TMDB 공식 포스터 연동. API 키가 없거나 요청이 실패하면 조용히 null을 반환해
// 호출부(MovieCard)가 항상 그라디언트 플레이스홀더로 자연스럽게 대체되도록 한다.
// 출처 표기("This product uses the TMDB API...")는 app/layout.tsx 하단에 고정돼 있다.

const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

export async function getTmdbPosterUrl(title: string): Promise<string | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `${TMDB_API_BASE}/search/movie?query=${encodeURIComponent(title)}&language=ko-KR`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: 60 * 60 * 24 },
      }
    );
    if (!res.ok) return null;

    const data: { results?: { poster_path?: string | null }[] } = await res.json();
    const posterPath = data.results?.[0]?.poster_path;
    return posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : null;
  } catch {
    return null;
  }
}
