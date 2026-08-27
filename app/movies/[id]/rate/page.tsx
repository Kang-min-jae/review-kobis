import { notFound } from "next/navigation";
import { resolveMovieRateInfo } from "../../../_lib/movie-rate-info";
import RateForm from "../../../_components/RateForm";

export default async function RateMoviePage({ params }: PageProps<"/movies/[id]/rate">) {
  const { id } = await params;
  const info = await resolveMovieRateInfo(id);
  if (!info) notFound();

  return (
    <main className="px-5 py-6">
      <RateForm {...info} />
    </main>
  );
}
