import type { Metadata } from "next";
import MovieDetail, { movieDetailMetadata } from "../../../../../_components/detail/MovieDetail";

// 로그인한 사람의 영화 상세. 로그인 쿠키가 없는 요청은 next.config.ts의 rewrite가 공용 캐시 페이지
// (app/anon/movies/…)로 보낸다 — 화면은 같은 MovieDetail이다.
export async function generateMetadata({ params }: PageProps<"/movies/[id]/rate/category/[category]">): Promise<Metadata> {
  const { id, category } = await params;
  return movieDetailMetadata(id, category);
}

export default async function CategoryRatePage({ params }: PageProps<"/movies/[id]/rate/category/[category]">) {
  const { id, category } = await params;
  return <MovieDetail id={id} categoryParam={category} anonymous={false} />;
}
