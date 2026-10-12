"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signOutAction } from "../_lib/auth-actions";
import { getAccountSummaryAction } from "../_lib/account-actions";

// 헤더 오른쪽 "계정 영역" — 로그인 상태에 따라 [로그인] 버튼 또는 [프로필 + 닉네임 + ▾] 계정 메뉴.
// 세션은 서버(AccountMenuWithData)가 auth()로 확인해 넘겨주므로, 여기선 로그인/로그아웃 로직을 새로 만들지 않고
// 기존 로그인 페이지(/login?callbackUrl=)와 signOutAction만 호출한다.

export type AccountUser = { nickname: string; image: string | null };

// 계정 영역 자리 너비를 상태(확인 중·로그인 전·로그인 후)와 상관없이 고정해, 옆의 검색창 너비가 흔들리지 않게 한다.
export const ACCOUNT_SLOT_CLASS = "flex w-[76px] shrink-0 justify-end sm:w-[196px]";

const NICKNAME_MAX = 8;

// 로그인 후 돌아올 경로 — 같은 사이트 안의 경로만 허용한다("//evil.com" 같은 외부 주소 차단).
function currentReturnPath(): string {
  const path = `${window.location.pathname}${window.location.search}`;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return "/";
  if (path.startsWith("/login") || path.startsWith("/signup")) return "/";
  return path;
}

function Avatar({ user, size }: { user: AccountUser; size: 32 | 40 }) {
  const [failed, setFailed] = useState(false);
  const dim = size === 32 ? "h-8 w-8 text-sm" : "h-10 w-10 text-base";
  if (user.image && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 소셜 프로필 이미지(외부 도메인 여러 곳)
      <img src={user.image} alt="" onError={() => setFailed(true)} className={`${dim} shrink-0 rounded-full object-cover`} />
    );
  }
  return (
    <span aria-hidden="true" className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-star font-bold text-black`}>
      {Array.from(user.nickname)[0] ?? "?"}
    </span>
  );
}

// 선 아이콘(stroke) — 메뉴 항목 왼쪽에 둔다.
function LineIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden="true">
      {children}
    </svg>
  );
}

const MENU_ITEMS: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/my-list",
    label: "나만의 영화 리스트",
    icon: (
      <LineIcon>
        <path d="M5 4h14v16l-7-4-7 4z" />
      </LineIcon>
    ),
  },
  // "내가 쓴 한줄평"은 아직 내 한줄평만 모아 보는 페이지가 없어 숨김.
  {
    href: "/mypage",
    label: "설정",
    icon: (
      <LineIcon>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </LineIcon>
    ),
  },
];

function LoginButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/login?callbackUrl=${encodeURIComponent(currentReturnPath())}`)}
      // 보이는 높이는 40px, before 요소로 위아래 2px씩 넓혀 클릭 영역은 44px.
      className="relative h-10 shrink-0 rounded-[10px] border border-white px-3 text-sm font-bold text-white transition-colors before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-[''] hover:border-star hover:text-star focus-visible:border-star focus-visible:text-star focus-visible:outline-none sm:px-4"
    >
      로그인
    </button>
  );
}

function LoggedInMenu({ user }: { user: AccountUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<{ ratedMovies: number; shortReviews: number } | null | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const chars = Array.from(user.nickname);
  const shortName = chars.length > NICKNAME_MAX ? `${chars.slice(0, NICKNAME_MAX).join("")}…` : user.nickname;

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function openMenu() {
    setOpen(true);
    if (summary === undefined) {
      getAccountSummaryAction()
        .then((s) => setSummary(s))
        .catch(() => setSummary(null));
    }
  }

  // 열리면 첫 항목에 포커스.
  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  // 바깥 클릭이면 닫는다(포커스는 사용자가 누른 곳에 둔다).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onMenuKeyDown(e: ReactKeyboardEvent) {
    const items = itemRefs.current.filter((el): el is HTMLElement => el !== null);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const itemClass =
    "flex h-11 w-full items-center gap-3 px-4 text-left text-sm text-text transition-colors hover:bg-surface-hover focus:bg-surface-hover focus:outline-none";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "account-menu" : undefined}
        aria-label={`계정 메뉴 열기 (${user.nickname})`}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(e) => {
          if ((e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") && !open) {
            e.preventDefault();
            openMenu();
          }
        }}
        className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-[10px] px-1.5 transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none sm:justify-start sm:px-2"
      >
        <Avatar user={user} size={32} />
        <span className="hidden max-w-[7.5rem] truncate text-sm font-bold text-text sm:inline">{shortName}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`hidden h-4 w-4 shrink-0 text-muted transition-transform sm:block ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          id="account-menu"
          role="menu"
          aria-label="계정 메뉴"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-50 mt-2 w-[min(240px,calc(100vw-32px))] overflow-hidden rounded-xl border border-neutral-700 bg-surface py-1 shadow-2xl"
        >
          <div className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
            <Avatar user={user} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-text">{user.nickname}</p>
              {summary && (
                <p className="mt-0.5 text-xs text-muted">
                  평가 {summary.ratedMovies.toLocaleString("ko-KR")}편 · 한줄평 {summary.shortReviews.toLocaleString("ko-KR")}개
                </p>
              )}
            </div>
          </div>

          {MENU_ITEMS.map((item, i) => (
            <a
              key={item.href}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              href={item.href}
              role="menuitem"
              tabIndex={-1}
              onClick={(e) => {
                e.preventDefault();
                close(true);
                router.push(item.href);
              }}
              className={itemClass}
            >
              {item.icon}
              {item.label}
            </a>
          ))}

          <div role="separator" className="my-1 border-t border-neutral-800" />

          <button
            ref={(el) => {
              itemRefs.current[MENU_ITEMS.length] = el;
            }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              close(true);
              void signOutAction("/");
            }}
            className={`${itemClass} text-muted hover:text-text focus:text-text`}
          >
            <LineIcon>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </LineIcon>
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

export default function AccountMenu({ user }: { user: AccountUser | null }) {
  return <div className={ACCOUNT_SLOT_CLASS}>{user ? <LoggedInMenu user={user} /> : <LoginButton />}</div>;
}

// 세션을 확인하는 동안 보이는 자리 표시 — 최종 버튼과 같은 자리·높이를 차지해 깜빡임과 레이아웃 이동을 막는다.
export function AccountMenuSkeleton() {
  return (
    <div className={ACCOUNT_SLOT_CLASS} aria-hidden="true">
      <div className="flex h-11 items-center gap-2 px-1.5 sm:px-2">
        <span className="h-8 w-8 animate-pulse rounded-full bg-surface-hover" />
        <span className="hidden h-3.5 w-[60px] animate-pulse rounded bg-surface-hover sm:block" />
      </div>
    </div>
  );
}
