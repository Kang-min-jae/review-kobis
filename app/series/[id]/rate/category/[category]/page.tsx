import type { Metadata } from "next";
import SeriesDetail, { seriesDetailMetadata } from "../../../../../_components/detail/SeriesDetail";

// 로그인한 사람의 시리즈 상세. 로그인 쿠키가 없는 요청은 next.config.ts의 rewrite가 공용 캐시 페이지
// (app/anon/series/…)로 보낸다 — 화면은 같은 SeriesDetail이다.
export async function generateMetadata({ params }: PageProps<"/series/[id]/rate/category/[category]">): Promise<Metadata> {
  const { id, category } = await params;
  return seriesDetailMetadata(id, category);
}

export default async function SeriesCategoryRatePage({ params }: PageProps<"/series/[id]/rate/category/[category]">) {
  const { id, category } = await params;
  return <SeriesDetail id={id} categoryParam={category} anonymous={false} />;
}
