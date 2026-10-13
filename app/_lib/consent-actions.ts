"use server";

import { redirect } from "next/navigation";
import { auth, signOut, unstable_update } from "../../auth";
import { hasRequiredConsent, recordConsent } from "./terms-consent";

export type ConsentResult = { error: string } | null;

// 로그인 뒤 돌아갈 주소 — 사이트 안의 경로만 허용한다(외부 주소로 보내는 오픈 리다이렉트 방지).
function safeCallback(value: FormDataEntryValue | null): string {
  const url = typeof value === "string" ? value : "/";
  return url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\") ? url : "/";
}

// 동의 화면(/consent)에서 필수 약관에 동의 — 기록을 남기고 로그인 토큰의 "동의 필요" 표시를 지운다.
export async function agreeToTermsAction(_prev: ConsentResult, formData: FormData): Promise<ConsentResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "로그인이 필요해요." };
  if (!hasRequiredConsent(formData)) return { error: "필수 약관(이용약관·개인정보 수집·이용·만 14세 이상)에 동의해 주세요." };

  try {
    await recordConsent(session.user.id);
  } catch (error) {
    console.warn("[consent] 동의 기록 실패:", error);
    return { error: "동의를 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  // 로그인 토큰(쿠키)을 다시 발급해 proxy.ts가 더 이상 동의 화면으로 보내지 않게 한다.
  await unstable_update({});
  redirect(safeCallback(formData.get("callbackUrl")));
}

// 약관에 동의하지 않으면 로그아웃한다(서비스는 동의 없이 회원 기능을 제공하지 않는다).
export async function declineTermsAction() {
  await signOut({ redirectTo: "/" });
}
