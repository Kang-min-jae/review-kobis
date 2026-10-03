"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import TermsAgreement from "./TermsAgreement";
import { agreeToTermsAction, declineTermsAction, type ConsentResult } from "../_lib/consent-actions";
import { TERMS_OF_SERVICE, PRIVACY_CONSENT, AGE_CONSENT, MARKETING_CONSENT } from "../_lib/legal-content";

const TERMS_ITEMS = [
  { key: "terms", label: "이용약관 동의", required: true, content: TERMS_OF_SERVICE },
  { key: "privacy", label: "개인정보 수집·이용 동의", required: true, content: PRIVACY_CONSENT },
  { key: "age", label: "만 14세 이상입니다", required: true, content: AGE_CONSENT },
  { key: "marketing", label: "마케팅 정보 수신 동의", required: false, content: MARKETING_CONSENT },
];

export default function ConsentForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, pending] = useActionState<ConsentResult, FormData>(agreeToTermsAction, null);
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const requiredAgreed = TERMS_ITEMS.filter((item) => item.required).every((item) => agreed[item.key]);

  return (
    <div className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-surface p-6">
      <h1 className="text-lg font-bold text-text">약관 동의</h1>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        서비스를 이용하려면 아래 약관에 동의해 주세요. 전문은{" "}
        <Link href="/legal" className="underline underline-offset-2 hover:text-text" target="_blank">
          이용약관·개인정보 처리방침
        </Link>
        에서도 볼 수 있어요.
      </p>

      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <TermsAgreement items={TERMS_ITEMS} checked={agreed} onChange={setAgreed} />
        {state?.error && <p className="text-xs text-brand">{state.error}</p>}
        <button
          type="submit"
          disabled={pending || !requiredAgreed}
          className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "저장 중..." : "동의하고 계속하기"}
        </button>
      </form>

      <form action={declineTermsAction} className="mt-3">
        <button type="submit" className="w-full text-center text-xs text-muted underline underline-offset-2 hover:text-text">
          동의하지 않고 로그아웃
        </button>
      </form>
    </div>
  );
}
