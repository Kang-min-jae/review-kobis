// 상세 페이지 오른쪽 "별점 분포" — 이 항목 한줄평 평점(0~10)을 점수대별로 나눠 막대로 보여준다.
// 9점(9.0~10), 8점(8.0~8.9), 7점(7.0~7.9), 6점(6.0~6.9), ~5점(5.9 이하).
const BUCKETS = [
  { label: "9점", min: 9 },
  { label: "8점", min: 8 },
  { label: "7점", min: 7 },
  { label: "6점", min: 6 },
  { label: "~5점", min: -Infinity },
] as const;

export default function RatingDistribution({ ratings }: { ratings: number[] }) {
  const valid = ratings.filter((r) => Number.isFinite(r));
  const counts: number[] = BUCKETS.map(() => 0);
  for (const r of valid) {
    counts[BUCKETS.findIndex((b) => r >= b.min)] += 1;
  }
  const total = valid.length;

  return (
    <section className="rounded-2xl border border-neutral-800 bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-text">별점 분포</h2>
        <span className="text-[11px] text-muted">{total.toLocaleString("ko-KR")}명</span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {BUCKETS.map((bucket, i) => {
          const count = counts[i];
          const percent = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <li key={bucket.label} className="flex items-center gap-2 text-xs">
              <span className="w-9 shrink-0 text-muted">{bucket.label}</span>
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-black/40"
                role="img"
                aria-label={`${bucket.label} ${count}명 (${percent}%)`}
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
