"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import type { Session } from "next-auth";
import { signOutAction } from "../_lib/auth-actions";
import { getGuestIdentity } from "../_lib/guest-identity";
import {
  BACKGROUND_THEMES,
  applyBackgroundTheme,
  applyWhiteOverride,
  toggleBackgroundThemeId,
  setWhiteOverride,
  subscribe as subscribeBgTheme,
  getBackgroundThemeIdSnapshot,
  getServerBackgroundThemeIdSnapshot,
  getWhiteOverrideSnapshot,
  getServerWhiteOverrideSnapshot,
} from "../_lib/background-theme";
import {
  subscribe as subscribeReviews,
  getMyReviewsSnapshot,
  getServerMyReviewsSnapshot,
} from "../_lib/reviews-store";
import {
  subscribe as subscribeDiaryLog,
  getDiaryLogSnapshot,
  getServerDiaryLogSnapshot,
} from "../_lib/diary-log-store";
import {
  subscribe as subscribeVotes,
  getVotesSnapshot,
  getServerVotesSnapshot,
  getReviewVote,
} from "../_lib/review-votes-store";

import { getBadge, TIER_STYLES } from "../_lib/tier";
import {
  DiaryIcon,
  CollectionIcon,
  PersonIcon,
  GearIcon,
  BellIcon,
  MoonIcon,
  HelpIcon,
  LogoutIcon,
} from "./MenuIcons";
import NotificationPanel from "./NotificationPanel";

// 실제 기능이 아직 없는 항목(컬렉션/팔로잉 목록/계정 설정/알림/고객센터)은 엉뚱한
// 페이지로 보내는 링크 대신, 메뉴만 닫히는 버튼으로 둔다 — 없는 기능을 있는 것처럼
// 보이게 링크를 만드는 것보다 이쪽이 정직하다.
function PlaceholderItem({
  icon,
  label,
  onClose,
}: {
  icon: ReactNode;
  label: string;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm text-muted transition-colors hover:bg-black/30 hover:text-text"
    >
      {icon}
      {label}
    </button>
  );
}

export default function SideMenu({
  session,
  nickname,
  monthlyRatingCount,
  followerCount = 0,
}: {
  session: Session | null;
  nickname?: string | null;
  monthlyRatingCount?: number;
  followerCount?: number;
}) {
  const [open, setOpen] = useState(false);
  // 서버 prop(monthlyRatingCount)을 초기값으로 쓰되, 메뉴 열 때마다 실시간 fetch로 갱신한다.
  const [liveMonthlyCount, setLiveMonthlyCount] = useState<number | undefined>(monthlyRatingCount);
  // 서버 prop이 바뀌면(layout 재렌더) 로컬 상태도 동기화
  useEffect(() => { setLiveMonthlyCount(monthlyRatingCount); }, [monthlyRatingCount]);
  const close = () => setOpen(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // 게스트 이름은 브라우저에서만 알 수 있어서(localStorage), reviews-store의
  // 다른 스냅샷들과 같은 방식(useSyncExternalStore)으로 읽는다 — 서버 렌더에선
  // 고정된 기본값을, 마운트 후에는 실제 값을 돌려줘서 하이드레이션 경고를 피한다.
  // 게스트 정체성은 한 번 만들어지면 안 바뀌므로 구독은 아무것도 안 해도 된다.
  const guestName = useSyncExternalStore(
    () => () => {},
    () => getGuestIdentity().name,
    () => "게스트"
  );

  const bgThemeId = useSyncExternalStore(
    subscribeBgTheme,
    getBackgroundThemeIdSnapshot,
    getServerBackgroundThemeIdSnapshot
  );
  const whiteOverride = useSyncExternalStore(
    subscribeBgTheme,
    getWhiteOverrideSnapshot,
    getServerWhiteOverrideSnapshot
  );
  // body의 실제 배경은 CSS 기본값(첫 번째 프리셋)으로 시작하므로, 저장된 값이
  // 그와 다르면 마운트 시 한 번 복원해 준다. DOM만 건드리고 state는 안 바꾸는
  // 순수 부수효과라 이펙트에서 호출해도 안전하다.
  useEffect(() => {
    applyBackgroundTheme(getBackgroundThemeIdSnapshot());
    applyWhiteOverride(getWhiteOverrideSnapshot());
  }, []);
  // "다크모드" 스위치는 프리셋을 하나도 안 고른(검정 배경) 상태에서만 의미가
  // 있다 — 프리셋 색이 이미 정해져 있으면 켜고 끌 "어둡다/밝다"가 없다.
  const canToggleDark = bgThemeId === null;

  const myReviews = useSyncExternalStore(subscribeReviews, getMyReviewsSnapshot, getServerMyReviewsSnapshot);
  const votesState = useSyncExternalStore(subscribeVotes, getVotesSnapshot, getServerVotesSnapshot);
  const logEntries = useSyncExternalStore(subscribeDiaryLog, getDiaryLogSnapshot, getServerDiaryLogSnapshot);

  const rawFallback = session?.user?.name ?? session?.user?.email ?? null;
  const fallback = rawFallback?.includes("@") ? rawFallback.split("@")[0] : rawFallback;
  const displayName = nickname ?? fallback ?? guestName;
  const avatarUrl = session?.user?.image ?? null;

  const totalLikes = myReviews.reduce((sum, r) => sum + getReviewVote(votesState, r.id).likes, 0);
  const tier = getBadge(totalLikes);

  // 메뉴가 열릴 때마다 최신 월간 관람 수를 서버에서 가져온다.
  // 서버 렌더 시 전달된 초기값을 넘겨주고, 실제 fetch 결과로 교체한다.
  useEffect(() => {
    if (!open || !session?.user?.id) return;
    fetch("/api/user/monthly-count")
      .then((r) => r.json())
      .then(({ count }: { count: number }) => setLiveMonthlyCount(count))
      .catch(() => {});
  }, [open, session?.user?.id]);

  const now = new Date();
  const thisMonthLocalCount = myReviews.filter((r) => {
    const d = new Date(r.createdAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  // 다이어리 "+ 영화 추가" 로그는 localStorage에만 저장되므로 별도로 합산한다.
  // 평점(reviews/serverRatedMovies)과 중복되지 않도록, 로그 항목 중 같은 날 같은 영화가
  // reviews에 없는 것만 추가로 센다.
  const thisMonthLogCount = logEntries.filter((e) => {
    const [y, m] = e.watchedDate.split("-").map(Number);
    if (y !== now.getFullYear() || m !== now.getMonth() + 1) return false;
    // 같은 영화가 같은 달에 이미 review로 있으면 중복이므로 제외
    return !myReviews.some((r) => {
      const d = new Date(r.createdAt);
      return (
        r.movieId === e.movieId &&
        d.getFullYear() === y &&
        d.getMonth() + 1 === m
      );
    });
  }).length;
  // 로그인 사용자는 실시간 fetch한 DB 평점 수 + 로그 수, 비로그인은 localStorage 수 + 로그 수
  const thisMonthCount = (liveMonthlyCount ?? thisMonthLocalCount) + thisMonthLogCount;


  return (
    <>
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
      <button
        type="button"
        aria-label="메뉴 열기"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded p-2 text-text transition-colors hover:bg-white/10"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={close} />
          <div className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto bg-surface p-5 shadow-2xl">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full" />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-star text-base font-bold text-black">
                  {displayName.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold text-text">
                  <span className="truncate">{displayName}님</span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TIER_STYLES[tier].border} ${TIER_STYLES[tier].text} ${TIER_STYLES[tier].bg}`}>
                    {tier}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  이번 달 {thisMonthCount}편 관람 · 팔로워 {followerCount}
                </p>
              </div>
            </div>

            <p className="mt-6 px-2 text-xs font-semibold text-muted">내 활동</p>
            <nav className="mt-2 space-y-1">
              <Link
                href="/diary"
                onClick={close}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-text transition-colors hover:bg-black/30"
              >
                <DiaryIcon />
                다이어리
              </Link>
              <Link
                href="/collection"
                onClick={close}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-text transition-colors hover:bg-black/30"
              >
                <CollectionIcon />
                컬렉션
              </Link>
              <Link
                href="/my-list#following"
                onClick={close}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-text transition-colors hover:bg-black/30"
              >
                <PersonIcon />
                팔로잉 목록
              </Link>
            </nav>

            <p className="mt-6 px-2 text-xs font-semibold text-muted">설정</p>
            <nav className="mt-2 space-y-1">
              <Link
                href="/mypage"
                onClick={close}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-text transition-colors hover:bg-black/30"
              >
                <GearIcon />
                계정 설정
              </Link>
              <button
                type="button"
                onClick={() => { close(); setNotifOpen(true); }}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm text-text transition-colors hover:bg-black/30"
              >
                <BellIcon />
                알림
              </button>
              <div
                className={`flex items-center justify-between rounded-lg px-2 py-2.5 text-sm text-text ${
                  canToggleDark ? "" : "opacity-50"
                }`}
              >
                <span className="flex items-center gap-3">
                  <MoonIcon />
                  다크모드
                </span>
                {/* 배경 프리셋을 하나도 안 고른 상태(검정)에서만 켜고 끌 수 있다 —
                    끄면 흰 배경으로, 다시 켜면 검정으로 돌아간다. 프리셋을 이미
                    골랐으면 그 프리셋 색이 우선이라 스위치를 잠가 둔다. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={!whiteOverride}
                  aria-label="다크모드 전환"
                  disabled={!canToggleDark}
                  onClick={() => setWhiteOverride(!whiteOverride)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    whiteOverride ? "bg-neutral-500" : "bg-star"
                  } ${canToggleDark ? "cursor-pointer" : "cursor-not-allowed"}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-black transition-transform ${
                      whiteOverride ? "translate-x-1" : "translate-x-4"
                    }`}
                  />
                </button>
              </div>

              {/* 배경 테마 선택 — 프리셋을 누르면 그 자리에서 사이트 배경이 바뀌고
                  다음 방문에도 유지된다(localStorage). */}
              <div className="grid grid-cols-2 gap-2 px-2 py-2">
                {BACKGROUND_THEMES.map((theme) => {
                  const isActive = theme.id === bgThemeId;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => toggleBackgroundThemeId(theme.id)}
                      style={{ backgroundImage: theme.gradient }}
                      className={`rounded-full border px-3 py-1.5 text-center text-[11px] font-semibold shadow-inner transition-all ${
                        theme.light ? "text-black" : "text-white"
                      } ${
                        isActive ? "border-star ring-2 ring-star/60" : "border-white/20 opacity-80 hover:opacity-100"
                      }`}
                    >
                      {theme.label}
                    </button>
                  );
                })}
              </div>

              {session?.user?.role === "ADMIN" && (
                <Link
                  href="/admin"
                  onClick={close}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm font-semibold text-red-400 transition-colors hover:bg-black/30"
                >
                  <span className="text-base leading-none">🛠</span>
                  관리자 대시보드
                </Link>
              )}
              <Link
                href="/help"
                onClick={close}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm text-muted transition-colors hover:bg-black/30 hover:text-text"
              >
                <HelpIcon />
                고객센터
              </Link>
              {session?.user && (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    signOutAction();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm text-brand transition-colors hover:bg-black/30"
                >
                  <LogoutIcon />
                  로그아웃
                </button>
              )}
            </nav>

            <p className="mt-8 text-center text-[11px] text-muted">이용약관 · 개인정보처리방침</p>
          </div>
        </>
      )}
    </>
  );
}
