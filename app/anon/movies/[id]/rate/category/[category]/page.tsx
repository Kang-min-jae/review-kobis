import type { Metadata } from "next";
import MovieDetail, { movieDetailMetadata } from "../../../../../../_components/detail/MovieDetail";

// 로그인 쿠키가 없는 요청의 영화 상세 — next.config.ts의 rewrite가 /movies/<id>/rate(…)를 이 경로로 보낸다
// (주소창에는 원래 주소가 보인다). 로그인 정보를 읽지 않아 모든 방문자에게 같은 화면이라 캐시(ISR)해 두고
// CDN이 바로 응답한다. 리뷰·평점이 바뀌면 서버 액션이 이 경로도 다시 만들게 한다(review-actions.ts).
// 리뷰·평점·공감이 바뀌면 바로 다시 만들고(review-actions.ts), 그 밖의 정보(박스오피스 순위 등)는 1시간마다.
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
