// 상세 페이지 오른쪽 "별점 분포" — 이 항목 한줄평 평점(0~10)을 별 5개 기준(반올림)으로 나눠 막대로 보여준다.
export default function RatingDistribution({ ratings }: { ratings: number[] }) {
  const buckets = [0, 0, 0, 0, 0]; // index 0 → 1점 … 4 → 5점
  for (const r of ratings) {
    if (!Number.isFinite(r)) continue;
    const stars = Math.min(5, Math.max(1, Math.round(r / 2)));
    buckets[stars - 1] += 1;
  }
  const total = ratings.length;

  return (
    <section className="rounded-2xl border border-neutral-800 bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-text">별점 분포</h2>
        <span className="text-[11px] text-muted">{total.toLocaleString("ko-KR")}명</span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {[5, 4, 3, 2, 1].map((stars) => {
          const count = buckets[stars - 1];
          const percent = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <li key={stars} className="flex items-center gap-2 text-xs">
              <span className="w-8 shrink-0 text-muted">{stars}점</span>
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-black/40"
                role="img"
                aria-label={`${stars}점 ${count}명 (${percent}%)`}
              >
                <div className="h-full rounded-full bg-star" style={{ width: `${percent}%` }} />
              </div>
              <span className="w-9 shrink-0 text-right text-muted">{percent}%</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
