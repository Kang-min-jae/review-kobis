"use client";

import { useSyncExternalStore, type ReactNode } from "react";

// 상세 페이지 상단의 "평점" / "예고편 · 예매" 버튼.
//
// 모바일(1열 화면, lg 미만)에선 두 버튼이 탭처럼 동작한다 — "평점"(기본)을 누른 상태에선 평점 영역만,
// "예고편 · 예매"를 눌러야 예고편·예매 박스가 보인다. 보이는 영역은 레이아웃 요소(#detail-layout)의
// data-mobile-view 값으로 CSS가 정한다(page.tsx의 max-lg:group-data-… 클래스).
// 넓은 화면(lg 이상)에선 두 영역이 항상 나란히 보이므로 해당 영역으로 스크롤만 한다.
//
// 이동할 때는 위에 고정된 헤더 높이만큼 띄워 부드럽게 스크롤하고, 도착한 영역을 잠깐 노란 테두리로 강조한다.

export type DetailView = "rate" | "watch";

let currentView: DetailView = "rate";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setView(view: DetailView) {
  currentView = view;
  const layout = document.getElementById("detail-layout");
  if (layout) layout.dataset.mobileView = view;
  listeners.forEach((l) => l());
}

function scrollToTarget(targetId: string) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const header = document.querySelector<HTMLElement>(".sticky.top-0");
  const offset = (header?.getBoundingClientRect().height ?? 0) + 12;
  const top = target.getBoundingClientRect().top + window.scrollY - offset;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });

  target.classList.add("ring-2", "ring-star", "ring-offset-2", "ring-offset-bg");
  window.setTimeout(() => target.classList.remove("ring-2", "ring-star", "ring-offset-2", "ring-offset-bg"), 1400);
  // 키보드·스크린리더 사용자도 이동한 위치에서 이어서 읽을 수 있게 포커스를 옮긴다.
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

const ACTIVE = "border border-transparent bg-star font-bold text-black hover:opacity-90";
// 비활성(모바일). 넓은 화면에선 "평점"이 항상 노란 버튼으로 보이도록 lg에서 활성 모양을 덧씌운다.
const INACTIVE = "border border-neutral-700 font-semibold text-text hover:border-neutral-500";
const INACTIVE_RATE_DESKTOP = "lg:border-transparent lg:bg-star lg:font-bold lg:text-black";

export default function ScrollToButton({
  view,
  targetId,
  className = "",
  children,
}: {
  view: DetailView;
  targetId: string;
  className?: string;
  children: ReactNode;
}) {
  const active = useSyncExternalStore(subscribe, () => currentView === view, () => view === "rate");

  function handleClick() {
    const isWide = window.matchMedia("(min-width: 1024px)").matches;
    if (!isWide) setView(view);
    // 보이는 영역이 바뀐 뒤(다음 프레임) 위치를 재야 정확하다.
    window.requestAnimationFrame(() => scrollToTarget(targetId));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      className={`rounded-full px-4 py-2 text-sm transition-colors ${
        active ? ACTIVE : `${INACTIVE} ${view === "rate" ? INACTIVE_RATE_DESKTOP : ""}`
      } ${className}`}
    >
      {children}
    </button>
  );
}
