import type { UserReviewStats } from "../_lib/review-data";

export default function UserStyleReport({
  stats,
  userName,
}: {
  stats: UserReviewStats;
  userName: string;
}) {
  if (stats.reviewCount === 0) return null;

  return (
    <div className="rounded-lg border border-neutral-700 bg-surface p-4">
      <h2 className="text-sm font-bold text-text">{userName}님의 평론 스타일 분석 리포트</h2>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-black/30 p-3 text-center">
          <p className="text-lg font-bold text-brand">{stats.movieCount}</p>
          <p className="mt-0.5 text-[11px] text-muted">평가한 영화</p>
        </div>
        <div className="rounded-lg bg-black/30 p-3 text-center">
          <p className="text-lg font-bold text-brand">{stats.reviewCount}</p>
          <p className="mt-0.5 text-[11px] text-muted">남긴 리뷰</p>
        </div>
        <div className="rounded-lg bg-black/30 p-3 text-center">
          <p className="text-lg font-bold text-star">
            {stats.shortAvg !== null ? stats.shortAvg.toFixed(1) : "—"}
            <span className="mx-1 text-muted">/</span>
            {stats.longAvg !== null ? stats.longAvg.toFixed(1) : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">한줄평(10) / 장문평(100) 평균</p>
        </div>
        <div className="rounded-lg bg-black/30 p-3 text-center">
          <p className="text-lg font-bold text-text">
            {stats.shortCount} / {stats.longCount}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">한줄평 / 장문평</p>
        </div>
      </div>

      {stats.topLikedContent && stats.topLikedCount > 0 && (
        <div className="mt-4 border-t border-neutral-700 pt-3">
          <p className="text-[11px] text-muted">가장 많은 좋아요를 받은 평론</p>
          <p className="mt-1 line-clamp-2 text-sm text-text">"{stats.topLikedContent}"</p>
          <p className="mt-1 text-[11px] font-semibold text-star">👍 {stats.topLikedCount}</p>
        </div>
      )}
    </div>
  );
}
