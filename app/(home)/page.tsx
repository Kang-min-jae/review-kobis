import HomeContent, { HOME_METADATA } from "../_components/home/HomeContent";
import { resolveCategory, resolveGenre } from "../_components/CategoryNav";

export const metadata = HOME_METADATA;

// 로그인한 사람의 홈. 로그인 쿠키가 없는 요청은 next.config.ts의 rewrite가 공용 캐시 페이지
// (app/anon/home/[category]/[genre])로 보낸다 — 화면은 같은 HomeContent다.
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const category = resolveCategory(typeof params.category === "string" ? params.category : undefined);
  const genre = resolveGenre(typeof params.genre === "string" ? params.genre : undefined);
  return <HomeContent category={category} genre={genre} anonymous={false} />;
}
