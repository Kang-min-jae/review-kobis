import { notFound } from "next/navigation";
import { allMovies } from "../../../_lib/mock-movies";
import RateForm from "../../../_components/RateForm";

export default async function RateMoviePage({ params }: PageProps<"/movies/[id]/rate">) {
  const { id } = await params;
  const movie = allMovies.find((m) => m.id === id);

  if (!movie) notFound();

  return (
    <main className="px-5 py-6">
      <RateForm movieId={movie.id} movieTitle={movie.title} />
    </main>
  );
}
