import Link from "next/link";
import type { CategoryAverage } from "../_lib/review-data";
import type { RatingCategory } from "../_lib/category-ratings-store";
import { rateCategoryBase } from "../_lib/rating-input";

// 전체/연출/연기/각본/음악/편집을 세로로 나열한다. 각 항목을 누르면 그 항목에 평점을
// 남길 수 있는 페이지로 이동하고, 항목 이름 옆에는 사용자들이 남긴 평점의 평균이 뜬다.
// 평균은 서버 컴포넌트(페이지)가 DB에서 미리 조회해 내려준다.
// movieId가 "tmdb-tv-"로 시작하면 시리즈 경로를 사용한다.
export default function CategoryRatings({
  movieId,
  averages,
  activeCategory,
}: {
  movieId: string;
  averages: CategoryAverage[];
  activeCategory?: RatingCategory;
}) {
  const base = rateCategoryBase(movieId);

  return (
    <div className="w-full shrink-0 rounded-lg border border-neutral-700 bg-surface p-3 sm:w-44">
      <h2 className="text-xs font-bold text-text">항목별 평점</h2>

      <div className="mt-2 space-y-0.5">
        {averages.map(({ category, average, count }) => (
          <Link prefetch={false}
            key={category}
            href={`${base}/${encodeURIComponent(category)}`}
            className={`flex items-center justify-between rounded-lg px-1.5 py-1 text-xs transition-colors ${
              category === activeCategory
                ? "bg-brand/20 text-brand"
                : "text-text hover:bg-black/30"
            }`}
          >
            <span className={category === activeCategory ? "font-semibold" : ""}>{category}</span>
            <span className="flex items-center gap-1 text-star">
              <span className="font-bold">{average !== null ? average.toFixed(1) : "-"}</span>
              {count > 0 && <span className="text-[10px] text-muted">({count})</span>}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
