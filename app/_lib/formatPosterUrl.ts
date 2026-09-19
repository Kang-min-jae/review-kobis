const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

// TMDB 상대 경로(`/abc.jpg`)가 DB에 직접 저장된 경우 풀 URL로 보정한다.
// HTTP 포스터는 브라우저 Mixed Content 차단을 막기 위해 HTTPS로 변환한다.
export function formatPosterUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  if (rawUrl.startsWith("/")) return `${TMDB_IMAGE_BASE}${rawUrl}`;
  if (rawUrl.startsWith("http://")) return rawUrl.replace("http://", "https://");
  return rawUrl;
}
