"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import StarRating from "./StarRating";
import {
  subscribe as subscribeReviews,
  getMyReviewsSnapshot,
  getServerMyReviewsSnapshot,
  removeReviewsForMovieOnDate,
} from "../_lib/reviews-store";
import type { Review } from "../_lib/mock-reviews";
import type { MyRatedMovie } from "../_lib/my-rated-movies";
import { deleteAccountRatingAction, deleteMyMovieReviewsAction } from "../_lib/review-actions";
import {
  subscribe as subscribeDiaryLog,
  getDiaryLogSnapshot,
  getServerDiaryLogSnapshot,
  removeDiaryLogForMovieOnDate,
  type DiaryLogEntry,
} from "../_lib/diary-log-store";

function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(dateKey: string): string {
  const parts = dateKey.split("-").map(Number);
  return `${parts[1]}월 ${parts[2]}일`;
}

type Row = {
  movieId: string;
  title: string;
  posterUrl: string | null;
  gradient: string;
  rating: number | null; // 0~10 정규화. 로그로만 남긴 기록은 평점이 없다.
  shortComment: string | null; // 내가 쓴 한줄평
  // 실제 계정으로 남긴 평점(전체 평점 남기기)이 자동으로 채운 칸이면 true — 삭제하는
  // 방식이 게스트 모드 로컬 데이터와 달라서(서버 액션 필요) 구분해서 처리한다.
  isAccountRating: boolean;
};

function buildRows(
  date: string,
  reviews: Review[],
  logs: DiaryLogEntry[],
  serverRatedMovies: MyRatedMovie[]
): Row[] {
  const byMovie = new Map<string, Row>();

  for (const r of reviews) {
    if (toLocalDateKey(r.createdAt) !== date) continue;
    const scale = r.type === "short" ? 10 : 100;
    const normalized = (r.rating / scale) * 10;
    const existing = byMovie.get(r.movieId);
    if (existing) {
      existing.rating = Math.max(existing.rating ?? 0, normalized);
      if (r.type === "short" && !existing.shortComment) existing.shortComment = r.content;
    } else {
      byMovie.set(r.movieId, {
        movieId: r.movieId,
        title: r.movieTitle,
        posterUrl: r.moviePosterUrl,
        gradient: r.movieGradient,
        rating: normalized,
        shortComment: r.type === "short" ? r.content : null,
        isAccountRating: false,
      });
    }
  }

  for (const m of serverRatedMovies) {
    if (toLocalDateKey(m.ratedAt) !== date) continue;
    if (!byMovie.has(m.id)) {
      byMovie.set(m.id, {
        movieId: m.id,
        title: m.title,
        posterUrl: m.posterUrl,
        gradient: m.gradient,
        rating: m.rating,
        shortComment: null,
        isAccountRating: true,
      });
    }
  }

  for (const e of logs) {
    if (e.watchedDate !== date) continue;
    if (!byMovie.has(e.movieId)) {
      byMovie.set(e.movieId, {
        movieId: e.movieId,
        title: e.movieTitle,
        posterUrl: e.moviePosterUrl,
        gradient: e.movieGradient,
        rating: null,
        shortComment: null,
        isAccountRating: false,
      });
    }
  }

  return Array.from(byMovie.values());
}

// 무비 다이어리에서 포스터가 채워진 칸을 클릭하면 뜨는 패널 — 그 날 본 영화 목록을
// 보여주고, 포스터를 누르면 영화 정보(평점) 페이지로 이동하고, 각 영화 아래엔 내가
// 쓴 한줄평(있으면)을 보여준다. "삭제"는 그 날짜의 그 영화 기록을 전부 지운다.
export default function DiaryDayDetailModal({
  date,
  serverRatedMovies = [],
  isLoggedIn = false,
  onClose,
  onAddMovie,
}: {
  date: string;
  serverRatedMovies?: MyRatedMovie[];
  isLoggedIn?: boolean;
  onClose: () => void;
  onAddMovie: () => void;
}) {
  const reviews = useSyncExternalStore(subscribeReviews, getMyReviewsSnapshot, getServerMyReviewsSnapshot);
  const logs = useSyncExternalStore(subscribeDiaryLog, getDiaryLogSnapshot, getServerDiaryLogSnapshot);
  const [localServerRatedMovies, setLocalServerRatedMovies] = useState(serverRatedMovies);
  const rows = buildRows(date, reviews, logs, localServerRatedMovies);
  const [deletingAccountRating, setDeletingAccountRating] = useState<string | null>(null);

  const handleDelete = (movieId: string) => {
    const removed = removeReviewsForMovieOnDate(movieId, date);
    removeDiaryLogForMovieOnDate(movieId, date);
    // 로컬에서만 지우면 서버 평점이 남아 다른 기기·다음 동기화 때 다시 나타난다.
    if (isLoggedIn && removed.length > 0) {
      const movieCd = movieId.replace(/^kobis-/, "");
      const entries = removed.map((r) => ({
        category: r.category ?? "전체",
        type: r.type === "short" ? ("SHORT" as const) : ("LONG" as const),
      }));
      deleteMyMovieReviewsAction(movieCd, entries).catch((error) => {
        console.error("[diary] 서버 리뷰 삭제 실패", error);
      });
    }
  };

  const handleDeleteAccountRating = async (movieId: string) => {
    const movieCd = movieId.replace(/^kobis-/, "");
    const prev = localServerRatedMovies;
    setLocalServerRatedMovies((list) => list.filter((m) => m.id !== movieId));
    setDeletingAccountRating(movieId);
    try {
      await deleteAccountRatingAction(movieCd);
    } catch {
      setLocalServerRatedMovies(prev);
    } finally {
      setDeletingAccountRating(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-surface p-4 shadow-2xl sm:inset-y-8 sm:right-8 sm:rounded-xl sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-text">{formatDateLabel(date)} · 본 영화</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-black/30 hover:text-text"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
          {rows.length === 0 && <p className="py-4 text-center text-xs text-muted">이 날 기록이 없어요.</p>}
          {rows.map((row) => {
            const isRatable = row.movieId.startsWith("kobis-");
            const poster = (
              <div
                className={`relative h-14 w-10 shrink-0 overflow-hidden rounded ${
                  row.posterUrl ? "bg-black" : `bg-gradient-to-br ${row.gradient}`
                }`}
              >
                {row.posterUrl && <PosterImage src={row.posterUrl} alt="" />}
              </div>
            );

            return (
              <div key={row.movieId} className="flex items-start gap-3 rounded-lg bg-black/20 p-2">
                {isRatable ? (
                  <Link href={`/movies/${row.movieId}/rate`} aria-label={`${row.title} 정보 보기`}>
                    {poster}
                  </Link>
                ) : (
                  poster
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{row.title}</p>
                  {row.rating !== null && <StarRating rating={row.rating} scale={10} size="h-3 w-3" />}
                  {row.shortComment && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{row.shortComment}</p>
                  )}
                </div>
                {row.isAccountRating ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteAccountRating(row.movieId)}
                    disabled={deletingAccountRating === row.movieId}
                    className="shrink-0 rounded-full border border-brand px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingAccountRating === row.movieId ? "삭제 중..." : "삭제"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDelete(row.movieId)}
                    className="shrink-0 rounded-full border border-brand px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand hover:text-white"
                  >
                    삭제
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onAddMovie}
          className="mt-3 rounded-lg border border-dashed border-neutral-600 py-2.5 text-center text-xs font-semibold text-muted transition-colors hover:border-star hover:text-star"
        >
          + 영화 추가
        </button>
      </div>
    </>
  );
}
