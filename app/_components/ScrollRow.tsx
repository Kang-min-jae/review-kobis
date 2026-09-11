"use client";

import { useRef, type ReactNode, type MouseEvent, type TouchEvent } from "react";

// 마우스 드래그 + 터치 스와이프로 가로 스크롤할 수 있는 래퍼.
// overflow-x: auto는 모바일 터치 스크롤을 지원하지만, 데스크톱에선 드래그가 안 되어
// 이 컴포넌트에서 mousedown/mousemove 이벤트로 드래그 스크롤을 구현한다.
export default function ScrollRow({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false });

  function onMouseDown(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    drag.current = { active: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft, moved: false };
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  }

  function onMouseMove(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!drag.current.active || !el) return;
    const x = e.pageX - el.offsetLeft;
    const delta = x - drag.current.startX;
    if (Math.abs(delta) > 4) drag.current.moved = true;
    el.scrollLeft = drag.current.scrollLeft - delta;
  }

  function stopDrag() {
    const el = ref.current;
    if (!el) return;
    drag.current.active = false;
    el.style.cursor = "";
    el.style.userSelect = "";
  }

  // 드래그 중에 자식 링크/버튼 클릭이 발생하지 않도록, 실제로 움직였으면 클릭 이벤트를 삼킨다.
  function onClickCapture(e: MouseEvent<HTMLDivElement>) {
    if (drag.current.moved) e.stopPropagation();
  }

  return (
    <div
      ref={ref}
      className={className}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onClickCapture={onClickCapture}
    >
      {children}
    </div>
  );
}
