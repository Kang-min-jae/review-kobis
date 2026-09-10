"use server";

import { signIn, signOut } from "../../auth";

export async function signInWithGoogle(callbackUrl?: string) {
  await signIn("google", callbackUrl ? { redirectTo: callbackUrl } : undefined);
}

export async function signInWithKakao(callbackUrl?: string) {
  await signIn("kakao", callbackUrl ? { redirectTo: callbackUrl } : undefined);
}

export async function signInWithNaver(callbackUrl?: string) {
  await signIn("naver", callbackUrl ? { redirectTo: callbackUrl } : undefined);
}

export async function signOutAction() {
  await signOut();
}
