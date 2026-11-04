import { NextResponse, type NextRequest } from "next/server";

// 작품 정보를 불러올 외부 API(KOBIS 등)를 잠깐 쓸 수 없을 때 상세 페이지가 보내는 곳(app/_lib/unavailable.ts).
// 503 + Retry-After로 답해 검색봇이 "없는 페이지"가 아니라 "잠시 후 다시"로 알아듣게 한다. 캐시하지 않고,
// 검색 결과에도 넣지 않는다.
export const dynamic = "force-dynamic";

const MIN_RETRY = 60;
const MAX_RETRY = 60 * 60 * 25;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const retry = Math.min(MAX_RETRY, Math.max(MIN_RETRY, Number(params.get("retry")) || 300));
  // 우리 사이트 안의 주소만 "다시 시도" 링크로 쓴다(다른 사이트로 보내는 데 쓰이지 않게).
  const from = params.get("from") ?? "/";
  const back = from.startsWith("/") && !from.startsWith("//") && !from.includes("\\") ? from : "/";
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>잠시 후 다시 시도해 주세요 | STILL THEATER</title>
<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
padding:20px;text-align:center;background:#000;color:#f5f5f5;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif}
p{margin:0;color:#9a9a9a;font-size:14px}h1{margin:0;font-size:18px}a{margin-top:8px;padding:10px 24px;border-radius:999px;
background:#e4302a;color:#fff;font-size:14px;font-weight:600;text-decoration:none}</style></head>
<body><h1>작품 정보를 잠시 불러올 수 없어요</h1><p>영화 정보 제공처의 사용량이 잠시 꽉 찼어요. 잠시 후 다시 시도해 주세요.</p>
<a href="${escapeHtml(back)}">다시 시도하기</a></body></html>`;
  return new NextResponse(html, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": String(retry),
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
