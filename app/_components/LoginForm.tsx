"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import ProviderButton from "./ProviderButton";
import { signInWithCredentialsAction, type ActionResult } from "../_lib/credentials-actions";
import { signInWithGoogle, signInWithKakao, signInWithNaver } from "../_lib/auth-actions";
import { useHydrated } from "../_lib/use-hydrated";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-neutral-700 bg-bg px-4 py-3 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none";

const STORAGE_KEY = "login_email";
const REMEMBER_KEY = "login_remember";

function readSavedLogin(): { remember: boolean; email: string } {
  try {
    const remember = localStorage.getItem(REMEMBER_KEY) === "1";
    return { remember, email: remember ? localStorage.getItem(STORAGE_KEY) ?? "" : "" };
  } catch {
    return { remember: false, email: "" };
  }
}

export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    signInWithCredentialsAction,
    null
  );
  // "아이디 기억하기"로 저장해 둔 값은 브라우저에서만 읽을 수 있다 — 하이드레이션 뒤에 읽고,
  // 사용자가 입력·체크를 바꾸면 그 값(null이 아닌 상태)이 우선한다.
  const hydrated = useHydrated();
  const saved = hydrated ? readSavedLogin() : { remember: false, email: "" };
  const [emailInput, setEmailInput] = useState<string | null>(null);
  const [rememberInput, setRememberInput] = useState<boolean | null>(null);
  const email = emailInput ?? saved.email;
  const remember = rememberInput ?? saved.remember;

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEmailInput(e.target.value);
  }

  function handleRememberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    setRememberInput(checked);
    try {
      if (checked) {
        localStorage.setItem(REMEMBER_KEY, "1");
        localStorage.setItem(STORAGE_KEY, email);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }

  function handleSubmit() {
    try {
      if (remember) {
        localStorage.setItem(STORAGE_KEY, email);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch {}
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-surface p-6">
      <h1 className="text-lg font-bold text-text">로그인</h1>
      <p className="mt-1 text-xs text-muted">아이디로 로그인하거나 계정을 만드세요.</p>

      <form action={formAction} onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div>
          <label htmlFor="email" className="text-xs text-muted">
            아이디
          </label>
          <input
            id="email"
            name="email"
            type="text"
            required
            placeholder="아이디 또는 이메일"
            value={email}
            onChange={handleEmailChange}
            className={inputClass}
            autoComplete="username"
          />
          <label className="mt-2 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={remember}
              onChange={handleRememberChange}
              className="h-3.5 w-3.5 accent-brand"
            />
            <span className="text-xs text-muted">아이디 기억</span>
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-xs text-muted">
              비밀번호
            </label>
            <Link prefetch={false} href="/forgot-password" className="text-xs font-semibold text-brand hover:underline">
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

      <Link prefetch={false}
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
