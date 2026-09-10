import Link from "next/link";

export const tabCategories = [
  "영화",
  "현재 상영중인 영화",
  "TV·시리즈물",
  "단편·독립",
] as const;
export type TabCategory = (typeof tabCategories)[number];
export type NavActive = TabCategory | "my-list";

export const genreLabels = [
  "전체",
  "액션",
  "스릴러",
  "로맨스",
  "드라마",
  "애니메이션",
  "모험",
  "SF",
  "공포",
  "코미디",
  "범죄",
  "판타지",
  "미스터리",
  "다큐멘터리",
  "뮤지컬",
] as const;
export type GenreLabel = (typeof genreLabels)[number];

export default function CategoryNav({
  active,
  activeGenre = "전체",
}: {
  active: NavActive;
  activeGenre?: GenreLabel;
}) {
  return (
    <div>
      <nav className="flex flex-wrap items-center gap-5 border-b border-neutral-800 px-5 pt-1">
        <Link
          href="/my-list"
          className={`whitespace-nowrap border-b-2 pb-2.5 text-sm transition-colors ${
            active === "my-list"
              ? "border-star font-bold text-text"
              : "border-transparent font-medium text-text/80 hover:text-text"
          }`}
        >
          나만의 영화 리스트
        </Link>
        {tabCategories.map((category) => (
          <Link
            key={category}
            href={`/?category=${encodeURIComponent(category)}`}
            className={`whitespace-nowrap border-b-2 pb-2.5 text-sm transition-colors ${
              active === category
                ? "border-star font-bold text-text"
                : "border-transparent font-medium text-text/80 hover:text-text"
            }`}
          >
            {category}
          </Link>
        ))}
      </nav>

      {active !== "my-list" && active !== "TV·시리즈물" && (
        <nav className="px-5 py-4">
          {/* 세그먼트 슬라이더 — 전체를 하나의 캡슐로 묶고, 선택된 것만 살짝 밝은
              배경 + 컬러 텍스트로 보여준다(개별 테두리/아이콘 없이). */}
          <div className="inline-flex flex-wrap gap-1 rounded-full bg-surface p-1">
            {genreLabels.map((genre) => {
              const isActive = activeGenre === genre;
              return (
                <Link
                  key={genre}
                  href={`/?category=${encodeURIComponent(active)}&genre=${encodeURIComponent(genre)}`}
                  className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                    isActive ? "bg-star text-black" : "text-muted hover:text-text"
                  }`}
                >
                  {genre}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
