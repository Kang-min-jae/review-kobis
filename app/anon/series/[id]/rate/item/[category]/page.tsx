import type { Metadata } from "next";
import SeriesDetail, { seriesDetailMetadata } from "../../../../../../_components/detail/SeriesDetail";

// 로그인 쿠키가 없는 요청의 항목별 평점 페이지(/series/<id>/rate/category/<항목>) — next.config.ts의 rewrite가
// 이 경로로 보낸다(주소창에는 원래 주소가 보인다). 대표 페이지(/series/<id>/rate)는 그대로 ../category/전체
// 공용 캐시(ISR)를 쓴다.
//
// 항목별 페이지는 봇이 작품마다 항목 6개 × 주소 표기 여러 가지로 긁어 가서, ISR에 저장하면 서로 다른 주소마다
// ISR 쓰기가 생겼다(하루 70만 건). 그래서 이 경로는 ISR에 저장하지 않고 요청마다 만들며, next.config.ts의
// headers()가 비로그인 응답에 Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400 을 붙여
// CDN에만 1시간 캐시되게 한다(Next는 미리 붙은 Cache-Control을 동적 페이지에서 덮어쓰지 않는다).
// 로그인 정보를 읽지 않는 화면(anonymous)이라 CDN에 캐시돼도 개인 정보가 섞이지 않는다.
// 검색에는 내보내지 않는다(noindex, follow) — robots.txt도 수집을 막는다.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/anon/series/[id]/rate/item/[category]">): Promise<Metadata> {
  const { id, category } = await params;
  return seriesDetailMetadata(id, category, { categoryPage: true });
}

export default async function AnonSeriesCategoryDetail({ params }: PageProps<"/anon/series/[id]/rate/item/[category]">) {
  const { id, category } = await params;
  return <SeriesDetail id={id} categoryParam={category} anonymous />;
}
