"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import ProviderButton from "./ProviderButton";
import { signInWithCredentialsAction, type ActionResult } from "../_lib/credentials-actions";
import { signInWithGoogle, signInWithKakao, signInWithNaver } from "../_lib/auth-actions";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-neutral-700 bg-bg px-4 py-3 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none";

const STORAGE_KEY = "login_email";

export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    signInWithCredentialsAction,
    null
  );
  const [email, setEmail] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setEmail(saved);
    } catch {}
  }, []);

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setEmail(val);
    try { localStorage.setItem(STORAGE_KEY, val); } catch {}
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-surface p-6">
      <h1 className="text-lg font-bold text-text">로그인</h1>
      <p className="mt-1 text-xs text-muted">아이디로 로그인하거나 계정을 만드세요.</p>

      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div>
          <label htmlFor="email" className="text-xs text-muted">
            아이디 또는 이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="name@example.com"
            value={email}
            onChange={handleEmailChange}
            className={inputClass}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-xs text-muted">
              비밀번호
            </label>
            <Link href="/forgot-password" className="text-xs font-semibold text-brand hover:underline">
              아이디·비밀번호 찾기
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            placeholder="비밀번호 입력"
            className={inputClass}
          />
        </div>

        {state && "error" in state && <p className="text-xs text-brand">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-text py-3 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "로그인 중..." : "로그인"}
        </button>
      </form>

      <Link
        href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`}
        className="mt-3 block w-full rounded-full border border-neutral-700 py-3 text-center text-sm font-semibold text-text transition-colors hover:border-brand"
      >
        계정 만들기
      </Link>

      <div className="my-6 flex items-center gap-3">
        <span className="shrink-0 text-xs text-muted">간편 로그인</span>
        <div className="h-px flex-1 bg-neutral-700" />
      </div>

      <div className="space-y-2">
        <ProviderButton
          label="Google로 계속하기"
          bg="#FFFFFF"
          fg="#4285F4"
          letter="G"
          onClick={() => signInWithGoogle(callbackUrl)}
        />
        <ProviderButton
          label="Kakao로 계속하기"
          bg="#FEE500"
          fg="#3C1E1E"
          letter="K"
          onClick={() => signInWithKakao(callbackUrl)}
        />
        <ProviderButton
          label="Naver로 계속하기"
          bg="#03C75A"
          fg="#FFFFFF"
          letter="N"
          onClick={() => signInWithNaver(callbackUrl)}
        />
      </div>
    </div>
  );
}
