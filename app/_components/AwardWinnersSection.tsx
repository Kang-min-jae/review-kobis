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

const TAB_ICONS: Record<AwardTab["id"], { emoji: string; color: string }> = {
  academy:  { emoji: "🏆", color: "from-yellow-600 to-yellow-400" },
  cannes:   { emoji: "🌴", color: "from-rose-600 to-pink-400" },
  berlin:   { emoji: "🐻", color: "from-red-700 to-red-400" },
  venice:   { emoji: "🦁", color: "from-orange-600 to-amber-400" },
};

export default function AwardWinnersSection({ tabs }: { tabs: AwardTab[] }) {
  const [activeId, setActiveId] = useState<AwardTab["id"]>(tabs[0]?.id ?? "academy");
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  if (!activeTab || activeTab.movies.length === 0) return null;

  const { emoji } = TAB_ICONS[activeTab.id];

  return (
    <div>
      {/* 원형 영화제 탭 */}
      <div className="flex justify-center gap-6 px-5 pt-6">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          const { emoji: tabEmoji, color } = TAB_ICONS[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveId(tab.id)}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-lg transition-all ${
                  isActive
                    ? `bg-gradient-to-br ${color} ring-2 ring-star ring-offset-2 ring-offset-black scale-110`
                    : "bg-neutral-800 opacity-60 hover:opacity-90"
                }`}
              >
                {tabEmoji}
              </span>
              <span
                className={`text-[11px] font-semibold transition-colors ${
                  isActive ? "text-star" : "text-muted"
                }`}
              >
                {tab.name.replace(" 영화제", "").replace(" 시상식", "")}
              </span>
            </button>
          );
        })}
      </div>

      {/* 수상작 캐러셀 — BoxOfficeCoverflow 재사용 */}
      <BoxOfficeCoverflow
        key={activeId}
        title={`${emoji} ${activeTab.name} 수상작`}
        subtitle="최근 수상작"
        movies={activeTab.movies}
      />
    </div>
  );
}
