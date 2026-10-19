import type { Metadata } from "next";
import MovieDetail, { movieDetailMetadata } from "../../../../../../_components/detail/MovieDetail";

// 로그인 쿠키가 없는 요청의 영화 상세 — next.config.ts의 rewrite가 /movies/<id>/rate(…)를 이 경로로 보낸다
// (주소창에는 원래 주소가 보인다). 로그인 정보를 읽지 않아 모든 방문자에게 같은 화면이라 캐시(ISR)해 두고
// CDN이 바로 응답한다. 리뷰·평점이 바뀌면 서버 액션이 이 경로도 다시 만들게 한다(review-actions.ts).
// 리뷰·평점·공감이 바뀌면 바로 다시 만들고(review-actions.ts), 그 밖의 정보(박스오피스 순위 등)는 1시간마다.
// 공용 캐시 페이지는 요청마다 달라지는 정보를 읽지 않는다 — force-static이면 cookies()/headers()가 빈 값이
// 되어 로그인 정보가 섞일 수 없고, 외부 API를 부르는 cache: "no-store" fetch(예고편·TMDB·KMDb·KOBIS)도
// 페이지를 동적으로 바꾸지 않고 캐시 없이 실행만 된다. 이게 없으면 그런 fetch를 만나는 순간
// "Page changed from static to dynamic at runtime" 오류로 500이 났다(tests/anon-pages.test.ts가 지킨다).
export const dynamic = "force-static";
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/anon/movies/[id]/rate/category/[category]">): Promise<Metadata> {
  const { id, category } = await params;
  return movieDetailMetadata(id, category);
}

export default async function AnonMovieDetail({ params }: PageProps<"/anon/movies/[id]/rate/category/[category]">) {
  const { id, category } = await params;
  return <MovieDetail id={id} categoryParam={category} anonymous />;
}
