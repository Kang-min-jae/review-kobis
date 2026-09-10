"use client";

import { useState } from "react";
import CoverflowCarousel from "./CoverflowCarousel";
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
    <section className="px-5 py-6">
      <h2 className="text-lg font-bold text-text">수상작으로 보기</h2>
      <p className="mt-1 text-sm text-muted">세계 3대 영화제 · 아카데미 시상식의 최근 수상작만 모았어요</p>

      {/* 영화제 탭 */}
      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveId(tab.id)}
              className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                isActive
                  ? "border-star bg-star text-black"
                  : "border-white/20 text-muted hover:border-white/40 hover:text-text"
              }`}
            >
              {tab.icon === "trophy" ? (
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49L12 22l3.16-0.51C19.13 20.17 22 16.42 22 12c0-5.52-4.48-10-10-10zm0 18l-2.5-.4C7.17 18.75 5 15.57 5 12c0-3.86 3.14-7 7-7s7 3.14 7 7c0 3.57-2.17 6.75-4.5 7.6L12 20z" />
                  <path d="M9 9h2v5H9zm4 0h2v5h-2z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
              )}
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* 수상작 캐러셀 */}
      <CoverflowCarousel
        key={activeId}
        movies={activeTab.movies}
        hint="카드를 드래그하거나 화살표로 넘겨보세요"
      />
    </section>
  );
}
