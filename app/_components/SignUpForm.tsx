"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import TermsAgreement from "./TermsAgreement";
import ProviderButton from "./ProviderButton";
import { signUpAction, type ActionResult } from "../_lib/credentials-actions";
import { signInWithGoogle, signInWithKakao, signInWithNaver } from "../_lib/auth-actions";
import { TERMS_OF_SERVICE, PRIVACY_CONSENT, AGE_CONSENT } from "../_lib/legal-content";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-neutral-700 bg-bg px-4 py-3 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none";

const TERMS_ITEMS = [
  { key: "terms", label: "이용약관 동의", required: true, content: TERMS_OF_SERVICE },
  { key: "privacy", label: "개인정보 수집·이용 동의", required: true, content: PRIVACY_CONSENT },
  { key: "age", label: "만 14세 이상입니다", required: true, content: AGE_CONSENT },
];

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      {open ? (
        <>
          <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c6 0 9.5 7 9.5 7a15.6 15.6 0 0 1-3.4 4.3M6.7 6.7C4.2 8.3 2.5 12 2.5 12s3.5 7 9.5 7a9.6 9.6 0 0 0 3.3-.6" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </>
      )}
    </svg>
  );
}

type FieldStatus = "idle" | "checking" | "available" | "taken" | "too_short" | "too_long" | "invalid";

const USERNAME_RE = /^[a-zA-Z0-9_]{4,20}$/;

export default function SignUpForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(signUpAction, null);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [nickname, setNickname] = useState("");
  const [nicknameStatus, setNicknameStatus] = useState<FieldStatus>("idle");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<FieldStatus>("idle");
  const nicknameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usernameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (nicknameDebounce.current) clearTimeout(nicknameDebounce.current);
    const trimmed = nickname.trim();
    if (trimmed.length === 0) { setNicknameStatus("idle"); return; }
    if (trimmed.length < 2) { setNicknameStatus("too_short"); return; }
    if (trimmed.length > 20) { setNicknameStatus("too_long"); return; }
    setNicknameStatus("checking");
    // 입력이 바뀐 뒤 도착한 이전 값의 중복 확인 결과는 버린다 — 늦게 온 응답이 새 값의 상태를
    // 덮어써 이미 쓰는 이름이 "사용 가능"으로 보일 수 있었다.
    let cancelled = false;
    nicknameDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-nickname?nickname=${encodeURIComponent(trimmed)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { available?: boolean };
        if (!cancelled) setNicknameStatus(data.available === true ? "available" : data.available === false ? "taken" : "idle");
      } catch {
        if (!cancelled) setNicknameStatus("idle");
      }
    }, 400);
    return () => {
      cancelled = true;
      if (nicknameDebounce.current) clearTimeout(nicknameDebounce.current);
    };
  }, [nickname]);

  useEffect(() => {
    if (usernameDebounce.current) clearTimeout(usernameDebounce.current);
    const trimmed = username.trim();
    if (trimmed.length === 0) { setUsernameStatus("idle"); return; }
    if (trimmed.length < 4) { setUsernameStatus("too_short"); return; }
    if (trimmed.length > 20) { setUsernameStatus("too_long"); return; }
    if (!USERNAME_RE.test(trimmed)) { setUsernameStatus("invalid"); return; }
    setUsernameStatus("checking");
    // 입력이 바뀐 뒤 도착한 이전 값의 중복 확인 결과는 버린다 — 늦게 온 응답이 새 값의 상태를
    // 덮어써 이미 쓰는 이름이 "사용 가능"으로 보일 수 있었다.
    let cancelled = false;
    usernameDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-username?username=${encodeURIComponent(trimmed)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { available?: boolean };
        if (!cancelled) setUsernameStatus(data.available === true ? "available" : data.available === false ? "taken" : "idle");
      } catch {
        if (!cancelled) setUsernameStatus("idle");
      }
    }, 400);
    return () => {
      cancelled = true;
      if (usernameDebounce.current) clearTimeout(usernameDebounce.current);
    };
  }, [username]);

  const requiredAgreed = TERMS_ITEMS.filter((item) => item.required).every((item) => agreed[item.key]);
  const socialConsent = { agreed: true } as const;
  const passwordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;

  return (
    <div className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-surface p-6">
      <h1 className="text-lg font-bold text-text">계정 만들기</h1>
      <p className="mt-1 text-xs text-muted">아이디와 비밀번호로 새 계정을 만드세요.</p>

      <form
        action={formAction}
        onSubmit={(e) => {
          if (password !== passwordConfirm) e.preventDefault();
        }}
        className="mt-6 space-y-4"
      >
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div>
          <label htmlFor="nickname" className="text-xs text-muted">
            닉네임
          </label>
          <input
            id="nickname"
            name="nickname"
            type="text"
            required
            maxLength={20}
            placeholder="다른 사람에게 보여질 이름"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className={inputClass}
          />
          {nicknameStatus === "checking" && (
            <p className="mt-1 text-xs text-muted">확인 중...</p>
          )}
          {nicknameStatus === "available" && (
            <p className="mt-1 text-xs text-green-400">사용 가능한 닉네임이에요.</p>
          )}
          {nicknameStatus === "taken" && (
            <p className="mt-1 text-xs text-brand">이미 사용 중인 닉네임이에요.</p>
          )}
          {nicknameStatus === "too_short" && (
            <p className="mt-1 text-xs text-muted">닉네임은 2자 이상이어야 해요.</p>
          )}
          {nicknameStatus === "too_long" && (
            <p className="mt-1 text-xs text-brand">닉네임은 20자 이하여야 해요.</p>
          )}
        </div>

        <div>
          <label htmlFor="username" className="text-xs text-muted">
            아이디
          </label>
          <input
            id="username"
            name="username"
            type="text"
            required
            maxLength={20}
            placeholder="영문, 숫자, _  4~20자"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
            autoComplete="username"
          />
          {usernameStatus === "checking" && (
            <p className="mt-1 text-xs text-muted">확인 중...</p>
          )}
          {usernameStatus === "available" && (
            <p className="mt-1 text-xs text-green-400">사용 가능한 아이디예요.</p>
          )}
          {usernameStatus === "taken" && (
            <p className="mt-1 text-xs text-brand">이미 사용 중인 아이디예요.</p>
          )}
          {usernameStatus === "too_short" && (
            <p className="mt-1 text-xs text-muted">아이디는 4자 이상이어야 해요.</p>
          )}
          {usernameStatus === "too_long" && (
            <p className="mt-1 text-xs text-brand">아이디는 20자 이하여야 해요.</p>
          )}
          {usernameStatus === "invalid" && (
            <p className="mt-1 text-xs text-muted">영문, 숫자, 밑줄(_)만 사용 가능해요.</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="text-xs text-muted">
            비밀번호
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              placeholder="8자 이상, 영문·숫자 포함"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text"
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="passwordConfirm" className="text-xs text-muted">
            비밀번호 확인
          </label>
          <input
            id="passwordConfirm"
            type={showPassword ? "text" : "password"}
            required
            placeholder="비밀번호를 다시 입력하세요"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            className={inputClass}
          />
          {passwordMismatch && <p className="mt-1 text-xs text-brand">비밀번호가 일치하지 않아요.</p>}
        </div>

        <TermsAgreement items={TERMS_ITEMS} checked={agreed} onChange={setAgreed} />

        {state && "error" in state && <p className="text-xs text-brand">{state.error}</p>}

        <button
          type="submit"
          disabled={pending || !requiredAgreed}
          className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "가입 중..." : "가입하기"}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-muted">
        이미 계정이 있나요?{" "}
        <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="font-semibold text-brand hover:underline">
          로그인
        </Link>
      </p>

      <div className="my-6 flex items-center gap-3">
        <span className="shrink-0 text-xs text-muted">간편 가입</span>
        <div className="h-px flex-1 bg-neutral-700" />
      </div>
      {/* 소셜 계정으로 가입해도 위의 필수 약관 동의가 먼저다 — 동의 내용은 서버로 넘겨 계정이 만들어질 때 기록한다. */}
      {!requiredAgreed && <p className="-mt-3 mb-3 text-[11px] text-muted">위의 필수 약관에 동의하면 소셜 계정으로 가입할 수 있어요.</p>}

      <div className="space-y-2">
        <ProviderButton
          label="Google로 계속하기"
          bg="#FFFFFF"
          fg="#4285F4"
          letter="G"
          disabled={!requiredAgreed}
          onClick={() => signInWithGoogle(callbackUrl, socialConsent)}
        />
        <ProviderButton
          label="Kakao로 계속하기"
          bg="#FEE500"
          fg="#3C1E1E"
          letter="K"
          disabled={!requiredAgreed}
          onClick={() => signInWithKakao(callbackUrl, socialConsent)}
        />
        <ProviderButton
          label="Naver로 계속하기"
          bg="#03C75A"
          fg="#FFFFFF"
          letter="N"
          disabled={!requiredAgreed}
          onClick={() => signInWithNaver(callbackUrl, socialConsent)}
        />
      </div>
    </div>
  );
}
