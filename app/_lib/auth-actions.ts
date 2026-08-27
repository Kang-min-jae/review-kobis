"use server";

import { signIn, signOut } from "../../auth";

export async function signInWithGoogle() {
  await signIn("google");
}

export async function signInWithKakao() {
  await signIn("kakao");
}

export async function signInWithNaver() {
  await signIn("naver");
}

export async function signOutAction() {
  await signOut();
}
