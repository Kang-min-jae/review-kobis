"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import {
  subscribe as subscribeMyList,
  getMyListSnapshot,
  getServerMyListSnapshot,
  addToMyList,
  removeFromMyList,
  moveInMyList,
} from "../_lib/my-list-store";
import {
  subscribe as subscribeReviews,
  getUserReviewedMoviesSnapshot,
  getServerUserReviewedMoviesSnapshot,
  type ReviewedMovie,
} from "../_lib/reviews-store";
import {
  subscribe as subscribeSocial,
  getSocialSnapshot,
  getServerSocialSnapshot,
  getViewsSnapshot,
  getServerViewsSnapshot,
  getFollowerCount,
  getLikeCount,
  toggleFollow,
  toggleLike,
  recordView,
} from "../_lib/list-social-store";

export default function MyListView() {
  useEffect(() => {
    recordView();
  }, []);

  const myListIds = useSyncExternalStore(subscribeMyList, getMyListSnapshot, getServerMyListSnapshot);
  const reviewedMovies = useSyncExternalStore(
    subscribeReviews,
    getUserReviewedMoviesSnapshot,
    getServerUserReviewedMoviesSnapshot
  );
  const social = useSyncExternalStore(subscribeSocial, getSocialSnapshot, getServerSocialSnapshot);
  const views = useSyncExternalStore(subscribeSocial, getViewsSnapshot, getServerViewsSnapshot);

  const reviewedById = new Map(reviewedMovies.map((m) => [m.id, m]));
  const myListMovies = myListIds
    .map((id) => reviewedById.get(id))
    .filter((movie): movie is ReviewedMovie => Boolean(movie));
  const addableMovies = reviewedMovies.filter((m) => !myListIds.includes(m.id));

  return (
    <div className="px-5 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-text">나만의 영화 리스트</h1>
          <p className="mt-1 text-xs text-muted">
            오늘 조회수 {views.today} · 전체 조회수 {views.total}
          </p>
        </div>

        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={toggleFollow}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              social.following
                ? "border-brand bg-brand text-white"
                : "border-brand text-brand hover:bg-brand hover:text-white"
            }`}
          >
            {social.following ? "팔로잉" : "팔로우"} {getFollowerCount(social)}
          </button>
          <button
            type="button"
            onClick={toggleLike}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              social.liked
                ? "border-star bg-star text-black"
                : "border-star text-star hover:bg-star hover:text-black"
            }`}
          >
            ♥ {getLikeCount(social)}
          </button>
        </div>
      </div>

      {addableMovies.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-muted">평점을 남긴 영화 중 추가하기</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {addableMovies.map((movie) => (
              <button
                key={movie.id}
                type="button"
                onClick={() => addToMyList(movie.id)}
                className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-text transition-colors hover:border-brand hover:text-brand"
              >
                + {movie.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-2">
        {myListMovies.length === 0 ? (
          <p className="text-sm text-muted">
            {reviewedMovies.length === 0 ? (
              <>
                평점을 남긴 영화가 아직 없어요. 영화에{" "}
                <Link href="/" className="text-brand hover:underline">
                  평점을 남기면
                </Link>{" "}
                나만의 리스트에 추가할 수 있어요.
              </>
            ) : (
              "위에서 영화를 선택해 리스트에 추가해 보세요."
            )}
          </p>
        ) : (
          myListMovies.map((movie, index) => (
            <div key={movie.id} className="flex items-center gap-3 rounded-lg bg-surface p-3">
              <span className="w-6 shrink-0 text-center text-sm font-bold text-brand">{index + 1}</span>
              <div
                className={`relative h-12 w-9 shrink-0 overflow-hidden rounded ${
                  movie.posterUrl ? "bg-black" : `bg-gradient-to-br ${movie.gradient}`
                }`}
              >
                {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
              </div>
              <p className="flex-1 truncate text-sm text-text">{movie.title}</p>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => moveInMyList(movie.id, "up")}
                  disabled={index === 0}
                  className="h-7 w-7 rounded-full bg-black/40 text-xs text-text disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveInMyList(movie.id, "down")}
                  disabled={index === myListMovies.length - 1}
                  className="h-7 w-7 rounded-full bg-black/40 text-xs text-text disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeFromMyList(movie.id)}
                  className="h-7 w-7 rounded-full bg-black/40 text-xs text-brand"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
