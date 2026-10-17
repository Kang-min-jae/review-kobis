import type { Metadata } from "next";
import SeriesDetail, { seriesDetailMetadata } from "../../../../../../_components/detail/SeriesDetail";

// 로그인 쿠키가 없는 요청의 시리즈 상세 — next.config.ts의 rewrite가 /series/<id>/rate(…)를 이 경로로 보낸다.
// 로그인 정보를 읽지 않아 모든 방문자에게 같은 화면이라 캐시(ISR)해 두고 CDN이 바로 응답한다.
// 리뷰·평점·공감이 바뀌면 바로 다시 만들고(review-actions.ts), 그 밖의 정보는 1시간마다.
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/anon/series/[id]/rate/category/[category]">): Promise<Metadata> {
  const { id, category } = await params;
  return seriesDetailMetadata(id, category);
}

export default async function AnonSeriesDetail({ params }: PageProps<"/anon/series/[id]/rate/category/[category]">) {
  const { id, category } = await params;
  return <SeriesDetail id={id} categoryParam={category} anonymous />;
}
