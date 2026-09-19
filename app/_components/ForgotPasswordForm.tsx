"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  requestPasswordResetCodeAction,
  resetPasswordWithCodeAction,
  type ResetRequestResult,
  type ActionResult,
} from "../_lib/credentials-actions";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-neutral-700 bg-bg px-4 py-3 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");

  const [requestState, requestAction, requestPending] = useActionState<ResetRequestResult | null, FormData>(
    async (prev, fd) => {
      const result = await requestPasswordResetCodeAction(prev, fd);
      if (result.codeSent && !result.isError) setStep("code");
      return result;
    },
    null
  );

  const [resetState, resetAction, resetPending] = useActionState<ActionResult | null, FormData>(
    resetPasswordWithCodeAction,
    null
  );

  const resetSuccess = resetState !== null && !("error" in resetState);

  return (
    <div className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-surface p-6">
      <h1 className="text-lg font-bold text-text">비밀번호 재설정</h1>

      {resetSuccess ? (
        <>
          <p className="mt-4 text-sm text-text">비밀번호가 변경됐어요.</p>
          <Link
            href="/login"
            className="mt-6 block w-full rounded-full bg-brand py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            로그인하러 가기
          </Link>
        </>
      ) : step === "email" ? (
        <>
          <p className="mt-1 text-xs text-muted">가입할 때 쓴 이메일을 입력하면 6자리 인증 코드를 보내드려요.</p>
          <form action={requestAction} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="text-xs text-muted">이메일</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>

            {requestState && (
              <p className={`text-xs ${requestState.isError ? "text-brand" : "text-muted"}`}>
                {requestState.message}
              </p>
            )}

            <button
              type="submit"
              disabled={requestPending}
              className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {requestPending ? "전송 중..." : "인증 코드 보내기"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            <span className="font-medium text-text">{email}</span>으로 발송된 6자리 코드를 입력해 주세요.
          </p>
          <form action={resetAction} className="mt-6 space-y-4">
            <input type="hidden" name="email" value={email} />

            <div>
              <label htmlFor="code" className="text-xs text-muted">인증 코드</label>
              <input
                id="code"
                name="code"
                type="text"
                required
                maxLength={6}
                placeholder="6자리 숫자"
                inputMode="numeric"
                pattern="\d{6}"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="password" className="text-xs text-muted">새 비밀번호</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="8자 이상, 영문·숫자 포함"
                className={inputClass}
              />
            </div>

            {resetState && "error" in resetState && (
              <p className="text-xs text-brand">{resetState.error}</p>
            )}

            <button
              type="submit"
              disabled={resetPending}
              className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {resetPending ? "변경 중..." : "비밀번호 변경"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setStep("email")}
            className="mt-3 w-full text-center text-xs text-muted hover:text-text"
          >
            이메일 다시 입력하기
          </button>
        </>
      )}

      <p className="mt-4 text-center text-xs text-muted">
        <Link href="/login" className="font-semibold text-brand hover:underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
