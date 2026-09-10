import { redirect } from "next/navigation";

export default async function RateSeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/series/${id}/rate/category/${encodeURIComponent("전체")}`);
}
