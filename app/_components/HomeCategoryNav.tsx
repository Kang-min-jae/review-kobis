"use client";

import { useState, type MouseEvent } from "react";
import { useSearchParams } from "next/navigation";
import CategoryNav, { resolveCategory, resolveGenre } from "./CategoryNav";

// 홈 레이아웃에 고정된 탭. 탭 이동은 같은 페이지의 검색 파라미터만 바뀌는 이동이라
// Next가 새 데이터가 올 때까지 이전 화면을 그대로 두는데(loading.tsx도 이 경우엔 안
// 보인다), 그동안 탭 표시까지 안 바뀌면 클릭이 먹지 않은 것처럼 느껴진다. 누른 탭을
// 바로 선택 상태로 보여주고, URL이 실제로 바뀌면 그 값을 따른다.
export default function HomeCategoryNav() {
  const params = useSearchParams();
  const current = params.toString();
  const [pending, setPending] = useState<{ from: string; to: URLSearchParams } | null>(null);
  const effective = pending && pending.from === current ? pending.to : params;

  function onClickCapture(e: MouseEvent<HTMLDivElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const href = (e.target as Element).closest("a")?.getAttribute("href");
    if (!href?.startsWith("/?")) return;
    setPending({ from: current, to: new URL(href, window.location.href).searchParams });
  }

  return (
    <div onClickCapture={onClickCapture}>
      <CategoryNav active={resolveCategory(effective.get("category"))} activeGenre={resolveGenre(effective.get("genre"))} />
    </div>
  );
}
