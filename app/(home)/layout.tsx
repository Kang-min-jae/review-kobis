import { Suspense } from "react";
import SearchBar from "../_components/SearchBar";
import CategoryNav from "../_components/CategoryNav";
import HomeCategoryNav from "../_components/HomeCategoryNav";

// 홈의 탭(카테고리·장르)은 같은 페이지의 검색 파라미터만 바뀌는 이동이라, 헤더를
// 레이아웃에 두면 탭을 바꿔도 헤더가 다시 그려지거나 사용자 정보를 다시 조회하지 않는다.
export default function HomeLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <div className="sticky top-0 z-30 bg-bg">
        <SearchBar />
        <Suspense fallback={<CategoryNav active="영화" />}>
          <HomeCategoryNav />
        </Suspense>
      </div>
      {children}
    </>
  );
}
