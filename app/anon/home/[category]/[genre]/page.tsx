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
// 평점·좋아요가 바뀌면 캐시 태그로 바로 다시 만들고, 행 목록(박스오피스 등)은 하루마다.
// 공용 캐시 페이지는 요청마다 달라지는 정보를 읽지 않는다 — force-static이면 cookies()/headers()가 빈 값이
// 되어 로그인 정보가 섞일 수 없고, 외부 API를 부르는 cache: "no-store" fetch(예고편·TMDB·KMDb·KOBIS)도
// 페이지를 동적으로 바꾸지 않고 캐시 없이 실행만 된다. 이게 없으면 그런 fetch를 만나는 순간
// "Page changed from static to dynamic at runtime" 오류로 500이 났다(tests/anon-pages.test.ts가 지킨다).
export const dynamic = "force-static";
// 시간 주기는 길게(하루 — 행 목록은 매일 새벽 예약 작업이 새로 고친다) — 리뷰·평점·공감이 바뀌면 서버 액션이 바로 다시 만들게 한다. 다시 만들어도 내용이
// 같으면(InOrder로 바이트까지 같게 만든다) Vercel이 ISR 캐시를 새로 쓰지 않는다.
export const revalidate = 86400;
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
