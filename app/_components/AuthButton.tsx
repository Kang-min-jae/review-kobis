"use client";

import { useState } from "react";

function SocialIcon({
  label,
  bg,
  fg,
  letter,
}: {
  label: string;
  bg: string;
  fg: string;
  letter: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-transform hover:scale-105"
      style={{ backgroundColor: bg, color: fg }}
    >
      {letter}
    </button>
  );
}

export default function AuthButton() {
  const [open, setOpen] = useState(false);

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
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-neutral-700 bg-surface p-4 shadow-lg">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
              className="space-y-2"
            >
              <input
                type="text"
                placeholder="ID"
                className="w-full rounded border border-neutral-700 bg-bg px-2.5 py-1.5 text-xs text-text placeholder:text-muted focus:border-brand focus:outline-none"
              />
              <input
                type="password"
                placeholder="Password"
                className="w-full rounded border border-neutral-700 bg-bg px-2.5 py-1.5 text-xs text-text placeholder:text-muted focus:border-brand focus:outline-none"
              />
              <button
                type="submit"
                className="w-full rounded bg-brand py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                Sign in
              </button>
            </form>

<<<<<<< HEAD
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-[11px] text-muted hover:text-text"
              >
                Sign up
              </button>
              <div className="flex gap-1.5">
                <SocialIcon label="Naver" bg="#03C75A" fg="#FFFFFF" letter="N" />
                <SocialIcon label="Kakao" bg="#FEE500" fg="#3C1E1E" letter="K" />
                <SocialIcon label="Google" bg="#FFFFFF" fg="#4285F4" letter="G" />
              </div>
            </div>
=======
            <button
              type="button"
              className="mt-2 w-full text-center text-[11px] text-muted hover:text-text"
            >
              Sign up
            </button>
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914

            <div className="mt-1 flex justify-center gap-2 text-[10px] text-muted">
              <button type="button" className="hover:text-text">
                Forgot ID
              </button>
              <span>·</span>
              <button type="button" className="hover:text-text">
                Forgot password
              </button>
            </div>
<<<<<<< HEAD
=======

            <div className="mt-3 flex items-center gap-2">
              <div className="h-px flex-1 bg-neutral-700" />
              <span className="text-[10px] text-muted">or</span>
              <div className="h-px flex-1 bg-neutral-700" />
            </div>

            <div className="mt-3 flex justify-center gap-3">
              <SocialIcon label="Google" bg="#FFFFFF" fg="#4285F4" letter="G" />
              <SocialIcon label="Naver" bg="#03C75A" fg="#FFFFFF" letter="N" />
              <SocialIcon label="Kakao" bg="#FEE500" fg="#3C1E1E" letter="K" />
            </div>
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914
          </div>
        </>
      )}
    </div>
  );
}
