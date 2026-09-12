"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import MyRatedMovieCard from "./MyRatedMovieCard";
import MyRatedMoviesSection from "./MyRatedMoviesSection";
import MyStyleReport from "./MyStyleReport";
import MovieDiaryCalendar from "./MovieDiaryCalendar";
import CustomListsSection from "./CustomListsSection";
import type { MyRatedMovie } from "../_lib/my-rated-movies";
import { getBadge } from "../_lib/tier";
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
  getMyMovieRatingsSnapshot,
  getServerMyMovieRatingsSnapshot,
  getMyReviewsSnapshot,
  getServerMyReviewsSnapshot,
  type ReviewedMovie,
} from "../_lib/reviews-store";
import {
  subscribe as subscribeVotes,
  getVotesSnapshot,
  getServerVotesSnapshot,
  getReviewVote,
} from "../_lib/review-votes-store";
type FollowingUser = { id: string; name: string | null; image: string | null; nickname: string | null };

export default function MyListView({
  myRatedMovies,
  followerCount = 0,
  followingList = [],
  showCalendar = true,
  profileViews = { today: 0, total: 0 },
}: {
  myRatedMovies: MyRatedMovie[];
  followerCount?: number;
  followingList?: FollowingUser[];
  showCalendar?: boolean;
  profileViews?: { today: number; total: number };
}) {
  const myListIds = useSyncExternalStore(subscribeMyList, getMyListSnapshot, getServerMyListSnapshot);
  const reviewedMovies = useSyncExternalStore(
    subscribeReviews,
    getUserReviewedMoviesSnapshot,
    getServerUserReviewedMoviesSnapshot
  );
  const myMovieRatings = useSyncExternalStore(
    subscribeReviews,
    getMyMovieRatingsSnapshot,
    getServerMyMovieRatingsSnapshot
  );
  const myReviews = useSyncExternalStore(subscribeReviews, getMyReviewsSnapshot, getServerMyReviewsSnapshot);
  const votesState = useSyncExternalStore(subscribeVotes, getVotesSnapshot, getServerVotesSnapshot);
  const reviewedById = new Map(reviewedMovies.map((m) => [m.id, m]));
  const myListMovies = myListIds
    .map((id) => reviewedById.get(id))
    .filter((movie): movie is ReviewedMovie => Boolean(movie));
  const addableMovies = reviewedMovies.filter((m) => !myListIds.includes(m.id));

  const awardMovieMap = new Map(
    myRatedMovies.filter((m) => m.festivalAwards && m.festivalAwards.length > 0).map((m) => [m.id, m.festivalAwards!])
  );
  const topRatedMovies = [...myMovieRatings].sort((a, b) => b.rating - a.rating);
  const recentRatedMovies = [...myMovieRatings].sort((a, b) => (a.ratedAt < b.ratedAt ? 1 : -1));
  const totalReviewLikes = myReviews.reduce(
    (sum, review) => sum + getReviewVote(votesState, review.id).likes,
    0
  );
  const myTier = getBadge(totalReviewLikes);

  return (
    <div className="px-5 py-6">
      {showCalendar && <MovieDiaryCalendar reviews={myReviews} serverRatedMovies={myRatedMovies} />}

      <div className="mt-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-text">나만의 영화 리스트</h1>
          <p className="mt-1 text-xs text-muted">
            오늘 조회수 {profileViews.today} · 전체 조회수 {profileViews.total}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white">
            🏅 {myTier}
          </span>
          <span className="rounded-full border border-brand px-3 py-1.5 text-xs font-semibold text-brand">
            팔로워 {followerCount}
          </span>
          <span className="rounded-full border border-star px-3 py-1.5 text-xs font-semibold text-star">
            ♥ {totalReviewLikes}
          </span>
        </div>
      </div>

      {topRatedMovies.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold text-text">내가 높게 평가한 영화</h2>
          <div className="row-scrollbar mt-3 flex gap-4 overflow-x-auto pb-3">
            {topRatedMovies.map((movie) => (
              <MyRatedMovieCard key={movie.id} movie={movie} festivalAwards={awardMovieMap.get(movie.id)} />
            ))}
          </div>
        </div>
      )}

      {recentRatedMovies.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold text-text">최근에 평가한 영화</h2>
          <div className="row-scrollbar mt-3 flex gap-4 overflow-x-auto pb-3">
            {recentRatedMovies.map((movie) => (
              <MyRatedMovieCard key={`recent-${movie.id}`} movie={movie} festivalAwards={awardMovieMap.get(movie.id)} />
            ))}
          </div>
        </div>
      )}

      <MyRatedMoviesSection movies={myRatedMovies} />

      <div className="mt-6">
        <MyStyleReport />
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

      <div id="collections">
        <CustomListsSection />
      </div>

      {followingList.length > 0 && (
        <div id="following" className="mt-6">
          <h2 className="text-sm font-bold text-text">팔로잉 목록</h2>
          <div className="mt-3 space-y-2">
            {followingList.map((user) => {
              const name = user.nickname ?? user.name ?? "사용자";
              return (
                <Link
                  key={user.id}
                  href={`/user/${user.id}`}
                  className="flex items-center gap-3 rounded-lg bg-surface p-3 transition-colors hover:bg-surface/80"
                >
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt="" className="h-8 w-8 shrink-0 rounded-full" />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                      {name.slice(0, 1)}
                    </div>
                  )}
                  <span className="flex-1 truncate text-sm text-text">{name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
