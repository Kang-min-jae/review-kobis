"use client";

import { useState } from "react";
import BoxOfficeCoverflow from "./BoxOfficeCoverflow";
import type { RowMovie } from "../_lib/movie-rows";

export type AwardTab = {
  id: "academy" | "cannes" | "berlin" | "venice";
  name: string;
  icon: "trophy" | "star";
  movies: RowMovie[];
  edition?: string | null; // "제98회 · 2026년"
};

export default function AwardWinnersSection({ tabs: allTabs }: { tabs: AwardTab[] }) {
  // 수상작을 못 불러온 영화제는 탭에서 뺀다 — 예전엔 첫 탭(아카데미)이 비면 섹션 전체가 사라졌다.
  const tabs = allTabs.filter((t) => t.movies.length > 0);
  const [activeId, setActiveId] = useState<AwardTab["id"] | null>(null);
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  if (!activeTab) return null;

  return (
    <div className="mx-4 overflow-hidden rounded-2xl bg-[#110c20]">
      {/* 캐러셀 — 헤더 없이 포스터만 */}
      <BoxOfficeCoverflow key={activeTab.id} movies={activeTab.movies} />

      {/* 영화제 탭 + 제목/설명 */}
      <div className="px-5 pb-6 pt-1">
        <div className="flex justify-center gap-2">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab.id;
            const shortName = tab.name
              .replace(" 영화제", "")
              .replace(" 시상식", "");
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveId(tab.id)}
                aria-pressed={tab.id === activeTab.id}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
                  isActive
                    ? "border border-amber-400 text-amber-400"
                    : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {shortName}
              </button>
            );
          })}
        </div>

        <div className="mt-4 text-center">
          <p className="font-bold text-white">{activeTab.name} 수상작</p>
          <p className="mt-1 text-xs text-neutral-400">
            {activeTab.edition ? `${activeTab.edition} 수상작` : "최근 수상작"} · 드래그하거나 화살표로 넘겨보세요
          </p>
        </div>
      </div>
    </div>
  );
}
