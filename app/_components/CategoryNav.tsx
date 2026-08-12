"use client";

import Link from "next/link";

export const tabCategories = ["TV프로그램", "영화", "단편·독립", "현재 상영중인 영화"] as const;
export type TabCategory = (typeof tabCategories)[number];

export default function CategoryNav({
  active,
  onChange,
}: {
  active: TabCategory;
  onChange: (category: TabCategory) => void;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-4 px-5 pb-5">
      <Link href="/my-list" className="text-sm font-bold text-star transition-colors hover:text-star/80">
        나만의 영화 리스트
      </Link>
      <span className="h-4 w-px bg-neutral-700" />
      {tabCategories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onChange(category)}
          className={`text-sm transition-colors ${
            active === category ? "font-bold text-brand" : "text-brand/60 hover:text-brand"
          }`}
        >
          {category}
        </button>
      ))}
    </nav>
  );
}
