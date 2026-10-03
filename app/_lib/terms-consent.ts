// 약관 동의 기록 저장·확인 (서버 전용).
//
// 회원가입 화면의 체크박스만으로는 동의가 강제되지 않는다 — 화면을 거치지 않고 가입을 요청하거나
// 소셜 로그인으로 바로 계정이 만들어질 수 있다. 그래서 동의 사실을 DB(TermsConsent)에 남기고,
// 현재 버전에 동의한 기록이 없는 계정은 동의 화면(/consent)을 거쳐야 서비스를 쓸 수 있게 한다.

import { db } from "./db";
import { TERMS_VERSION } from "./legal-content";

// 가입 화면의 필수 동의 항목 — 체크박스 name은 `agree-${key}` (TermsAgreement.tsx)
export const REQUIRED_CONSENT_KEYS = ["terms", "privacy", "age"] as const;

// 소셜 로그인은 OAuth 제공자를 다녀온 뒤에 계정이 만들어져서 가입 화면의 체크 상태를 직접 받을 수
// 없다. 버튼을 누를 때 이 쿠키에 동의 내용을 담아 두고, 계정이 만들어질 때(auth.ts) 읽어 기록한다.
export const PENDING_CONSENT_COOKIE = "pending-terms-consent";

export function hasRequiredConsent(formData: FormData): boolean {
  return REQUIRED_CONSENT_KEYS.every((key) => formData.get(`agree-${key}`) === "on");
}

export async function recordConsent(userId: string, marketing: boolean): Promise<void> {
  const now = new Date();
  await db.termsConsent.upsert({
    where: { userId },
    create: { userId, termsVersion: TERMS_VERSION, agreedAt: now, marketing, marketingUpdatedAt: now },
    update: { termsVersion: TERMS_VERSION, agreedAt: now, marketing, marketingUpdatedAt: now },
  });
}

// 현재 버전 약관에 동의했는지. 동의 표(TermsConsent)가 아직 DB에 만들어지지 않았으면(마이그레이션
// 적용 전) 모든 회원이 막히지 않도록 동의한 것으로 본다.
export async function hasCurrentConsent(userId: string): Promise<boolean> {
  try {
    const consent = await db.termsConsent.findUnique({ where: { userId }, select: { termsVersion: true } });
    return consent?.termsVersion === TERMS_VERSION;
  } catch (error) {
    console.warn("[terms] 동의 기록 조회 실패(마이그레이션 적용 전일 수 있음):", error);
    return true;
  }
}

export async function getMarketingConsent(userId: string): Promise<boolean> {
  try {
    const consent = await db.termsConsent.findUnique({ where: { userId }, select: { marketing: true } });
    return consent?.marketing ?? false;
  } catch {
    return false;
  }
}
