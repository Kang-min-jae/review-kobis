import { redirect } from "next/navigation";

// "평점 남기기"는 이제 "전체" 항목도 다른 항목(연출/연기 등)과 똑같은 페이지에서
// 다루므로, 기본 진입점은 항상 전체 항목 페이지로 보낸다.
export default async function RateMoviePage({ params }: PageProps<"/movies/[id]/rate">) {
  const { id } = await params;
  redirect(`/movies/${id}/rate/category/${encodeURIComponent("전체")}`);
}
