import Link from "next/link";
import { nowInTheaters } from "../_lib/mock-movies";
import { nationwideTheaters } from "../_lib/mock-theaters";
import DayFilterTheaters from "../_components/DayFilterTheaters";

export default async function TheatersPage({ searchParams }: PageProps<"/theaters">) {
  const { movie: movieId } = await searchParams;
  const movie = nowInTheaters.find((m) => m.id === movieId);

  return (
    <main className="px-5 py-6">
      <Link href="/" className="text-sm text-muted hover:text-text">
        ← 뒤로
      </Link>

      <h1 className="mt-3 text-lg font-bold text-text">
        {movie ? `${movie.title} 예매하기` : "전국 영화관"}
      </h1>

      {movie ? (
        <>
          <p className="mt-1 text-sm text-muted">요일을 선택하면 그날 상영하는 극장이 표시돼요.</p>
          <div className="mt-6">
            <DayFilterTheaters movieId={movie.id} />
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">상영 중인 극장을 확인해 보세요.</p>
          <div className="mt-6 space-y-6">
            {nationwideTheaters.map((theater) => (
              <section key={theater.chain}>
                <h2 className="text-sm font-bold text-brand">{theater.chain}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {theater.branches.map((branch) => (
                    <span
                      key={branch.name}
                      className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-text"
                    >
                      {branch.name}
                    </span>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
