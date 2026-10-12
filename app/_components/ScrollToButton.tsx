"use client";

import type { ReactNode } from "react";

// 같은 페이지의 다른 영역으로 이동하는 버튼. 단순 #앵커 링크는 목표가 이미 화면 가까이 있으면
// (모바일에서 예고편 박스가 버튼 바로 아래에 있는 경우) 거의 움직이지 않고, 위에 고정된 헤더에
// 가려져서 눌러도 반응이 없는 것처럼 보였다. 고정 헤더 높이만큼 띄워서 부드럽게 스크롤하고,
// 도착한 영역을 잠깐 노란 테두리로 강조해 어디로 왔는지 보이게 한다.
export default function ScrollToButton({
  targetId,
  className,
  children,
}: {
  targetId: string;
  className?: string;
  children: ReactNode;
}) {
  function handleClick() {
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

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
