// 막을 봇(app/_lib/bots.ts)의 요청이 next.config.ts의 규칙으로 오는 곳 — 403만 돌려준다. 페이지를 만들지 않고
// DB·외부 API도 쓰지 않아, 예전 미들웨어 차단과 같은 아주 작은 실행 한 번이다(실행 비용까지 없애려면 Vercel Firewall).
export function GET() {
  return new Response("Forbidden", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}
