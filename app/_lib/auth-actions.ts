"use server";

import { cookies } from "next/headers";
import { signIn, signOut } from "../../auth";
import { PENDING_CONSENT_COOKIE } from "./terms-consent";

// 가입 화면에서 약관에 동의하고 소셜 버튼을 누른 경우 — OAuth 제공자를 다녀온 뒤 계정이 만들어질 때
// auth.ts가 이 쿠키를 읽어 동의를 기록한다(10분 안에 돌아오지 않으면 만료). 로그인 화면에서 누르면
// 동의 정보가 없어서, 새 계정이면 로그인 직후 동의 화면(/consent)으로 안내된다.
type SocialConsent = { agreed: true };

async function rememberConsent(consent?: SocialConsent) {
  if (!consent) return;
  const store = await cookies();
  store.set(PENDING_CONSENT_COOKIE, JSON.stringify({ agreed: true }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
}

export async function signInWithGoogle(callbackUrl?: string, consent?: SocialConsent) {
  await rememberConsent(consent);
  await signIn("google", callbackUrl ? { redirectTo: callbackUrl } : undefined);
}

export async function signInWithKakao(callbackUrl?: string, consent?: SocialConsent) {
  await rememberConsent(consent);
  await signIn("kakao", callbackUrl ? { redirectTo: callbackUrl } : undefined);
}

export async function signInWithNaver(callbackUrl?: string, consent?: SocialConsent) {
  await rememberConsent(consent);
  await signIn("naver", callbackUrl ? { redirectTo: callbackUrl } : undefined);
}

// redirectTo를 주면 로그아웃 후 그 경로로 이동한다(헤더 계정 메뉴는 "/"). 안 주면 기존 동작 그대로.
export async function signOutAction(redirectTo?: string) {
  const safe = typeof redirectTo === "string" && redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : undefined;
  await signOut(safe ? { redirectTo: safe } : undefined);
}
