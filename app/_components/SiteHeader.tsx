import SearchBar from "./SearchBar";
import CategoryNav, { type NavActive, type GenreLabel } from "./CategoryNav";

// 검색창 + 카테고리 내비게이션을 화면 상단에 고정해서, 스크롤해도 계속 떠 있게 한다.
export default function SiteHeader({
  active,
  activeGenre,
}: {
  active: NavActive;
  activeGenre?: GenreLabel;
}) {
  return (
    <div className="sticky top-0 z-30 bg-bg">
      <SearchBar />
      <CategoryNav active={active} activeGenre={activeGenre} />
    </div>
  );
}
