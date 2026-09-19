"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { Session } from "next-auth";
import { signOutAction } from "../_lib/auth-actions";

export default function AuthButton({ session, nickname }: { session: Session | null; nickname?: string | null }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  if (session?.user) {
    // nickname(DB) 우선 → OAuth name → email에서 @ 앞부분만 → 기본값
    const rawFallback = session.user.name ?? session.user.email ?? null;
    const fallback = rawFallback?.includes("@") ? rawFallback.split("@")[0] : rawFallback;
    const displayName = nickname ?? fallback ?? "사용자";

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
              <Link
                href="/mypage"
                onClick={() => setOpen(false)}
                className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-text hover:bg-black/30"
              >
                계정설정
              </Link>
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
    <button
      type="button"
      onClick={() => router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`)}
      className="shrink-0 rounded border border-neutral-700 px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-brand hover:text-brand"
    >
      Sign in
    </button>
  );
}
