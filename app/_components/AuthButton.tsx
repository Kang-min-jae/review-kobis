"use client";

import { useState } from "react";
import type { Session } from "next-auth";
import { signInWithGoogle, signInWithKakao, signInWithNaver, signOutAction } from "../_lib/auth-actions";

function ProviderButton({
  label,
  bg,
  fg,
  letter,
  onClick,
}: {
  label: string;
  bg: string;
  fg: string;
  letter: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg border border-neutral-700 px-3 py-2 text-xs font-semibold text-text transition-colors hover:border-brand"
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
        style={{ backgroundColor: bg, color: fg }}
      >
        {letter}
      </span>
      {label}
    </button>
  );
}

export default function AuthButton({ session }: { session: Session | null }) {
  const [open, setOpen] = useState(false);

  if (session?.user) {
    const displayName = session.user.name ?? session.user.email ?? "사용자";

    return (
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded border border-neutral-700 px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:border-brand hover:text-brand"
        >
          {session.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="h-5 w-5 rounded-full" />
          ) : null}
          <span className="max-w-[8rem] truncate">{displayName}</span>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-20 mt-2 w-40 rounded-lg border border-neutral-700 bg-surface p-2 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  signOutAction();
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-text hover:bg-black/30"
              >
                로그아웃
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-neutral-700 px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-brand hover:text-brand"
      >
        Sign in
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-56 space-y-2 rounded-lg border border-neutral-700 bg-surface p-3 shadow-lg">
            <ProviderButton
              label="Google로 계속하기"
              bg="#FFFFFF"
              fg="#4285F4"
              letter="G"
              onClick={() => {
                setOpen(false);
                signInWithGoogle();
              }}
            />
            <ProviderButton
              label="Kakao로 계속하기"
              bg="#FEE500"
              fg="#3C1E1E"
              letter="K"
              onClick={() => {
                setOpen(false);
                signInWithKakao();
              }}
            />
            <ProviderButton
              label="Naver로 계속하기"
              bg="#03C75A"
              fg="#FFFFFF"
              letter="N"
              onClick={() => {
                setOpen(false);
                signInWithNaver();
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
