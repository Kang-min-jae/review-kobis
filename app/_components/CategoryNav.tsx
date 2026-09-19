import Link from "next/link";

export const tabCategories = [
  "영화",
  "현재 상영중인 영화",
  "TV·시리즈물",
] as const;
export type TabCategory = (typeof tabCategories)[number];
export type NavActive = TabCategory | "my-list" | "awards";

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
      <nav className="no-scrollbar flex items-center overflow-x-auto border-b border-neutral-800 pt-1">
        <Link
          href="/my-list"
          className={`shrink-0 whitespace-nowrap border-b-2 px-4 pb-2.5 text-center text-sm transition-colors ${
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
            className={`shrink-0 whitespace-nowrap border-b-2 px-4 pb-2.5 text-center text-sm transition-colors ${
              active === category
                ? "border-star font-bold text-text"
                : "border-transparent font-medium text-text/80 hover:text-text"
            }`}
          >
            {category}
          </Link>
        ))}
        <Link
          href="/awards"
          className={`shrink-0 whitespace-nowrap border-b-2 px-4 pb-2.5 text-center text-sm transition-colors ${
            active === "awards"
              ? "border-star font-bold text-text"
              : "border-transparent font-medium text-text/80 hover:text-text"
          }`}
        >
          수상작 투표
        </Link>
      </nav>

      {active !== "my-list" && active !== "TV·시리즈물" && (
        <nav className="py-3">
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-1">
            {genreLabels.map((genre) => {
              const isActive = activeGenre === genre;
              return (
                <Link
                  key={genre}
                  href={`/?category=${encodeURIComponent(active)}&genre=${encodeURIComponent(genre)}`}
                  className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                    isActive ? "bg-star text-black" : "bg-surface text-muted hover:text-text"
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
