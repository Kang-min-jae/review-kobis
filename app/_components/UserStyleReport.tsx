import Link from "next/link";
import PosterImage from "./PosterImage";
import type { UserReviewStats } from "../_lib/review-data";
import type { MyRatedMovie } from "../_lib/my-rated-movies";
import { rateHrefFor } from "../_lib/rating-input";

export default function UserStyleReport({
  stats,
  userName,
  topMovies = [],
}: {
  stats: UserReviewStats;
  userName: string;
  topMovies?: MyRatedMovie[];
}) {
  if (stats.reviewCount === 0 && topMovies.length === 0) return null;

  return (
    <div className="rounded-lg border border-neutral-700 bg-surface p-4">
      <h2 className="text-sm font-bold text-text">{userName}님의 평론 스타일 분석 리포트</h2>

      {stats.reviewCount > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-black/30 p-3 text-center">
            <p className="text-lg font-bold text-brand">{stats.movieCount}</p>
            <p className="mt-0.5 text-[11px] text-muted">평가한 작품</p>
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
      )}

      {topMovies.length > 0 && (
        <div className={stats.reviewCount > 0 ? "mt-4 border-t border-neutral-700 pt-3" : "mt-3"}>
          <p className="text-[11px] text-muted mb-2">{userName}님이 높게 평가한 순위</p>
          <div className="space-y-2">
            {topMovies.map((movie, index) => {
              const href = rateHrefFor(movie.id);
              return (
                <Link prefetch={false}
                  key={movie.id}
                  href={href}
                  className="flex items-center gap-3 rounded-lg bg-black/30 p-2.5 transition-colors hover:bg-black/50"
                >
                  <span className="w-5 shrink-0 text-center text-sm font-bold text-brand">{index + 1}</span>
                  <div
                    className={`relative h-10 w-7 shrink-0 overflow-hidden rounded ${
                      movie.posterUrl ? "bg-black" : `bg-gradient-to-br ${movie.gradient}`
                    }`}
                  >
                    {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
                  </div>
                  <p className="flex-1 truncate text-sm text-text">{movie.title}</p>
                  {movie.categoryScores && movie.categoryScores.some((c) => c.category !== "전체") ? (
                    <div className="shrink-0 space-y-0.5">
                      {movie.categoryScores.map((c) => (
                        <div key={c.category} className="flex items-center justify-end gap-1.5 text-xs">
                          <span className="text-muted">{c.category}</span>
                          <span className="text-star" aria-hidden>★</span>
                          <span className="w-7 text-right font-semibold text-star">{c.score.toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="shrink-0 text-xs font-semibold text-star">{movie.rating.toFixed(1)}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
