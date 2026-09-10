"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction, type ActionResult } from "../_lib/credentials-actions";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(resetPasswordAction, null);
  const success = state !== null && !("error" in state);

  return (
    <div className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-surface p-6">
      <h1 className="text-lg font-bold text-text">비밀번호 재설정</h1>

      {success ? (
        <>
          <p className="mt-4 text-sm text-text">비밀번호가 변경됐어요.</p>
          <Link
            href="/login"
            className="mt-6 block w-full rounded-full bg-brand py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            로그인하러 가기
          </Link>
        </>
      ) : (
        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <label htmlFor="password" className="text-xs text-muted">
              새 비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="8자 이상"
              className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-bg px-4 py-3 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
            />
          </div>

          {state && "error" in state && <p className="text-xs text-brand">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "변경 중..." : "비밀번호 변경"}
          </button>
        </form>
      )}
    </div>
  );
}
