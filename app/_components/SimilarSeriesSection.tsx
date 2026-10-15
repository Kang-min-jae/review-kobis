import MovieCard from "./MovieCard";
import ScrollRow from "./ScrollRow";
import { getSimilarSeries, SIMILAR_SERIES_TITLE } from "../_lib/similar-series";

const ROW_SIZE = 10;

// 시리즈 상세 페이지 오른쪽 "비슷한 시리즈" — 시리즈 카드 최대 20개를 10개씩 두 줄(각 줄은 가로 스크롤)로
// 보여준다. 영화 상세의 "비슷한 영화"(SimilarMoviesSection)와 같은 모양이다.
export default async function SimilarSeriesSection(props: Parameters<typeof getSimilarSeries>[0]) {
  const series = await getSimilarSeries(props).catch(() => []);
  if (series.length === 0) return null;

  return (
    <section className="rounded-2xl border border-neutral-800 bg-surface p-4">
      <h2 className="text-sm font-bold text-text">{SIMILAR_SERIES_TITLE}</h2>
      {[series.slice(0, ROW_SIZE), series.slice(ROW_SIZE, ROW_SIZE * 2)]
        .filter((row) => row.length > 0)
        .map((row, i) => (
          <ScrollRow key={i} className="row-scrollbar mt-3 flex gap-3 overflow-x-auto pb-2">
            {row.map((s) => (
              <MovieCard key={s.id} movie={s} popoverSide="left" />
            ))}
          </ScrollRow>
        ))}
    </section>
  );
}
