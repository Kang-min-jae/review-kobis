import SearchBar from "./SearchBar";
import CategoryNav, { type NavActive, type GenreLabel } from "./CategoryNav";

// 검색창 + 카테고리 내비게이션을 화면 상단에 고정해서, 스크롤해도 계속 떠 있게 한다.
// active를 안 주면(카테고리 탭이 의미 없는 페이지 — 인물/평점/영화관 등) 카테고리
// 내비게이션 없이 검색창만 보여준다.
export default function SiteHeader({
  active,
  activeGenre,
  anonymous = false,
}: {
  active?: NavActive;
  activeGenre?: GenreLabel;
  anonymous?: boolean; // 로그인 쿠키 없는 요청용 공용(캐시) 페이지 — SearchBar 참고
}) {
  return (
    <div className="sticky top-0 z-30 bg-bg">
      <SearchBar anonymous={anonymous} />
      {active && <CategoryNav active={active} activeGenre={activeGenre} />}
    </div>
  );
}
