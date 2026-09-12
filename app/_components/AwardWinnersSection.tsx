"use client";

import { useState } from "react";
import BoxOfficeCoverflow from "./BoxOfficeCoverflow";
import type { RowMovie } from "../_lib/movie-rows";

export type AwardTab = {
  id: "academy" | "cannes" | "berlin" | "venice";
  name: string;
  icon: "trophy" | "star";
  movies: RowMovie[];
};

export default function AwardWinnersSection({ tabs }: { tabs: AwardTab[] }) {
  const [activeId, setActiveId] = useState<AwardTab["id"]>(tabs[0]?.id ?? "academy");
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  if (!activeTab || activeTab.movies.length === 0) return null;

  return (
    <div className="mx-4 overflow-hidden rounded-2xl bg-[#110c20]">
      {/* 캐러셀 — 헤더 없이 포스터만 */}
      <BoxOfficeCoverflow key={activeId} movies={activeTab.movies} />

      {/* 영화제 탭 + 제목/설명 */}
      <div className="px-5 pb-6 pt-1">
        <div className="flex justify-center gap-2">
          {tabs.map((tab) => {
            const isActive = tab.id === activeId;
            const shortName = tab.name
              .replace(" 영화제", "")
              .replace(" 시상식", "");
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveId(tab.id)}
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
            최근 수상작 · 드래그하거나 화살표로 넘겨보세요
          </p>
        </div>
      </div>
    </div>
  );
}
