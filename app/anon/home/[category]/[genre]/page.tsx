import { Suspense } from "react";
import { redirect } from "next/navigation";
import HomeContent, { HOME_METADATA } from "../../../../_components/home/HomeContent";
import SearchBar from "../../../../_components/SearchBar";
import CategoryNav, { genreLabels, tabCategories, type GenreLabel, type TabCategory } from "../../../../_components/CategoryNav";
import HomeCategoryNav from "../../../../_components/HomeCategoryNav";
import { safeDecode } from "../../../../_lib/safe-decode";

// 로그인 쿠키가 없는 요청의 홈 — next.config.ts의 rewrite가 "/?category=…&genre=…"를 이 경로로 보낸다
// (주소창에는 그대로 "/"가 보인다). 로그인 정보를 읽지 않아 모든 방문자에게 같은 화면이라, 탭·장르별로 한 번
// 만들어 캐시(ISR)해 두고 CDN이 바로 응답한다 — 방문할 때마다 서버 함수가 돌지 않는다.
// 평점을 남기면 서버 액션이 평균 별점 캐시 태그를 지워 이 페이지도 다음 요청 때 새로 만든다.
// 평점·좋아요가 바뀌면 캐시 태그로 바로 다시 만들고, 행 목록(박스오피스 등)은 10분마다.
export const revalidate = 600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

export const metadata = HOME_METADATA;

export default async function AnonHome({ params }: PageProps<"/anon/home/[category]/[genre]">) {
  const { category: rawCategory, genre: rawGenre } = await params;
  const category = safeDecode(rawCategory);
  const genre = safeDecode(rawGenre);
  // 아는 탭·장르가 아니면 기본 홈으로 보낸다(예전에도 모르는 값은 기본 탭으로 보였다).
  if (!(tabCategories as readonly string[]).includes(category) || !(genreLabels as readonly string[]).includes(genre)) {
    redirect("/");
  }
  return (
    <>
      <div className="sticky top-0 z-30 bg-bg">
        <SearchBar anonymous />
        <Suspense fallback={<CategoryNav active={category as TabCategory} activeGenre={genre as GenreLabel} />}>
          <HomeCategoryNav />
        </Suspense>
      </div>
      <HomeContent category={category as TabCategory} genre={genre as GenreLabel} anonymous />
    </>
  );
}
