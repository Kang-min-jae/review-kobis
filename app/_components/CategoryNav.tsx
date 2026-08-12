import Link from "next/link";

export const tabCategories = ["TV프로그램", "영화", "단편·독립", "현재 상영중인 영화"] as const;
export type TabCategory = (typeof tabCategories)[number];
export type NavActive = TabCategory | "my-list";

export default function CategoryNav({ active }: { active: NavActive }) {
  return (
    <nav className="flex flex-wrap items-center gap-4 px-5 pb-5">
      <Link
        href="/my-list"
        className={`text-sm font-bold transition-colors ${
          active === "my-list" ? "text-star" : "text-star/70 hover:text-star"
        }`}
      >
        나만의 영화 리스트
      </Link>
      <span className="h-4 w-px bg-neutral-700" />
      {tabCategories.map((category) => (
        <Link
          key={category}
          href={`/?category=${encodeURIComponent(category)}`}
          className={`text-sm transition-colors ${
            active === category ? "font-bold text-brand" : "text-brand/60 hover:text-brand"
          }`}
        >
          {category}
        </Link>
      ))}
    </nav>
  );
}
