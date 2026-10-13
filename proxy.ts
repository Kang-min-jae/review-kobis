import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// 약관 동의 강제 — 현재 약관에 동의한 기록이 없는 로그인 계정(auth.ts가 로그인 토큰에
// needsConsent를 표시)은 어느 페이지로 들어오든 동의 화면(/consent)으로 보낸다. 로그인 화면에서
// 바로 소셜 가입해 동의 없이 계정이 만들어진 경우, 약관이 개정된 뒤 처음 들어온 경우가 해당된다.
//
// 로그인 토큰(JWT 쿠키)만 해독하고 DB는 보지 않는다 — 모든 페이지 요청 앞에서 도는 코드라
// 가벼워야 한다. 비로그인 방문자는 쿠키가 없어 바로 통과한다.
const SESSION_COOKIE = "authjs.session-token";
const SECURE_SESSION_COOKIE = `__Secure-${SESSION_COOKIE}`;

export async function proxy(request: NextRequest) {
  const cookieNames = request.cookies.getAll().map((c) => c.name);
  const secureCookie = cookieNames.some((name) => name.startsWith(SECURE_SESSION_COOKIE));
  if (!secureCookie && !cookieNames.some((name) => name.startsWith(SESSION_COOKIE))) return NextResponse.next();

  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      secureCookie,
      cookieName: secureCookie ? SECURE_SESSION_COOKIE : SESSION_COOKIE,
    });
    if (token?.needsConsent === true) {
      const url = request.nextUrl.clone();
      url.pathname = "/consent";
      url.search = `?callbackUrl=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(url);
    }
  } catch (error) {
    // 토큰을 못 읽어도 페이지는 열어 준다(동의 강제보다 사이트가 멈추지 않는 쪽이 우선).
    console.warn("[proxy] 로그인 토큰 확인 실패:", error);
  }
  return NextResponse.next();
}

// 페이지 요청에만 적용한다 — API·정적 파일·이미지, 그리고 동의 화면 자체와 동의 전에도 볼 수
// 있어야 하는 화면(약관 전문, 로그인·가입·비밀번호 찾기)은 제외한다.
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|consent|legal|login|signup|forgot-password|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|webmanifest)$).*)",
  ],
};
