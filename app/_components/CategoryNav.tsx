import Link from "next/link";

<<<<<<< HEAD
export const tabCategories = [
  "영화",
  "현재 상영중인 영화",
  "재개봉작",
  "TV프로그램",
  "단편·독립",
] as const;
=======
export const tabCategories = ["영화", "현재 상영중인 영화", "TV프로그램", "단편·독립"] as const;
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914
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
      <nav className="flex flex-wrap items-center gap-4 px-5 pb-3">
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

      {active !== "my-list" && (
<<<<<<< HEAD
        <nav className="flex flex-wrap justify-between gap-x-4 gap-y-2 px-5 pb-5 text-xs">
=======
        <nav className="no-scrollbar flex gap-3 overflow-x-auto px-5 pb-5 text-xs">
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914
          {genreLabels.map((genre) => (
            <Link
              key={genre}
              href={`/?category=${encodeURIComponent(active)}&genre=${encodeURIComponent(genre)}`}
              className={`whitespace-nowrap transition-colors ${
                activeGenre === genre ? "font-bold text-text" : "text-muted hover:text-text"
              }`}
            >
              {genre}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
