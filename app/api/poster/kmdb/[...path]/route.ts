// KMDb(한국영상자료원) 포스터 중계 — /api/poster/kmdb/<경로> → http://file.koreafilm.or.kr/<경로>
//
// 이미지 최적화(/_next/image)를 끈 뒤로 KMDb 포스터를 브라우저가 KMDb 서버에서 직접 받게 됐는데, KMDb 이미지
// 서버는 다른 사이트에서 바로 불러오는 요청(https 미지원·외부 Referer)을 받아 주지 않아 포스터가 회색으로 비었다.
// 예전에 이미지 최적화가 서버에서 받아 오던 것과 같이, 서버가 받아서 그대로 전달한다 — 변환(리사이즈)은 하지
// 않아 이미지 최적화 사용량은 생기지 않는다. 한 번 받은 포스터는 CDN에 1년 캐시돼 같은 포스터로 서버 함수가
// 다시 돌지 않는다.
//
// file.koreafilm.or.kr의 이미지 경로만 받는다(다른 주소를 대신 불러오는 데 쓰이지 않게). 영상자료원 출처는
// 사이트 푸터에 밝히고 있다.

const KMDB_IMAGE_HOST = "http://file.koreafilm.or.kr";
const SEGMENT = /^[A-Za-z0-9._-]{1,120}$/;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;
const MAX_BYTES = 3 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

export const maxDuration = 15;

function notFound(): Response {
  // 없는 포스터도 1시간은 CDN이 바로 답하게 한다(같은 실패로 서버 함수가 반복해서 돌지 않게).
  return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!Array.isArray(path) || path.length === 0 || path.length > 12) return notFound();
  if (!path.every((seg) => SEGMENT.test(seg) && seg !== "." && seg !== "..")) return notFound();
  if (!IMAGE_EXT.test(path[path.length - 1])) return notFound();

  let upstream: Response;
  try {
    upstream = await fetch(`${KMDB_IMAGE_HOST}/${path.join("/")}`, {
      cache: "no-store", // 이미지 본문을 데이터 캐시에 쓰지 않는다 — CDN 캐시로 충분하다
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return notFound();
  }
  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !type.startsWith("image/")) return notFound();
  const declared = Number(upstream.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) return notFound();
  const body = await upstream.arrayBuffer().catch(() => null);
  if (!body || body.byteLength === 0 || body.byteLength > MAX_BYTES) return notFound();

  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=604800, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
