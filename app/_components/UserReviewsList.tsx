import Link from "next/link";
import StarRating from "./StarRating";
import type { UserReview } from "../_lib/review-data";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function UserReviewsList({ reviews }: { reviews: UserReview[] }) {
  if (reviews.length === 0) {
    return <p className="px-5 text-sm text-muted">아직 남긴 평가가 없어요.</p>;
  }

  const short = reviews.filter((r) => r.type === "SHORT");
  const long = reviews.filter((r) => r.type === "LONG");

  return (
    <div className="px-5 pb-16 space-y-6">
      <p className="text-xs text-muted">총 {reviews.length}개 평가</p>

      {short.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-text mb-2">한줄평 ({short.length})</h2>
          <div className="space-y-2">
            {short.map((r) => (
              <div key={r.id} className="rounded-xl bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Link prefetch={false}
                    href={`/movies/${r.movieCd}/rate/category/${encodeURIComponent(r.category)}`}
                    className="text-sm font-semibold text-text hover:underline truncate max-w-[70%]"
                  >
                    {r.movieTitle || r.movieCd}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted">{r.category}</span>
                    <StarRating rating={r.rating} scale={10} size="h-3 w-3" />
                  </div>
                </div>
                {r.content.trim() && (
                  <p className="mt-1.5 text-sm text-muted line-clamp-2">{r.content}</p>
                )}
                <p className="mt-1 text-[10px] text-muted">{fmtDate(r.createdAt)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {long.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-text mb-2">장문평 ({long.length})</h2>
          <div className="space-y-2">
            {long.map((r) => (
              <div key={r.id} className="rounded-xl bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Link prefetch={false}
                    href={`/movies/${r.movieCd}/rate/category/${encodeURIComponent(r.category)}`}
                    className="text-sm font-semibold text-text hover:underline truncate max-w-[70%]"
                  >
                    {r.movieTitle || r.movieCd}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted">{r.category}</span>
                    <StarRating rating={r.rating} scale={100} size="h-3 w-3" />
                  </div>
                </div>
                {r.content.trim() && (
                  <p className="mt-1.5 text-sm text-muted line-clamp-3">{r.content}</p>
                )}
                <p className="mt-1 text-[10px] text-muted">{fmtDate(r.createdAt)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
