"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type ResetRequestResult } from "../_lib/credentials-actions";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ResetRequestResult | null, FormData>(
    requestPasswordResetAction,
    null
  );

  return (
    <div className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-surface p-6">
      <h1 className="text-lg font-bold text-text">아이디·비밀번호 찾기</h1>
      <p className="mt-1 text-xs text-muted">가입할 때 쓴 이메일을 입력하면 재설정 링크를 보내드려요.</p>

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="text-xs text-muted">
            이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="name@example.com"
            className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-bg px-4 py-3 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
          />
        </div>

        {state && (
          <p className={`text-xs ${state.isError ? "text-brand" : "text-muted"}`}>{state.message}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "전송 중..." : "재설정 링크 보내기"}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-muted">
        <Link href="/login" className="font-semibold text-brand hover:underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
