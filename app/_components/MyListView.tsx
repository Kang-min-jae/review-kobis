"use client";

import { useSyncExternalStore, useState, useEffect } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import MyRatedMovieCard from "./MyRatedMovieCard";
import MyRatedMoviesSection from "./MyRatedMoviesSection";
import ScrollRow from "./ScrollRow";
import MyStyleReport from "./MyStyleReport";
import MovieDiaryCalendar from "./MovieDiaryCalendar";
import CustomListsSection from "./CustomListsSection";
import RatedMovieSearch from "./RatedMovieSearch";
import type { MyRatedMovie, SyncedReview } from "../_lib/my-rated-movies";
import { getBadge, TIER_STYLES, type Tier } from "../_lib/tier";
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
  initForUser,
  replaceWithServerReviews,
  type ReviewedMovie,
} from "../_lib/reviews-store";
type FollowingUser = { id: string; name: string | null; image: string | null; nickname: string | null; totalLikes?: number };

export default function MyListView({
  myRatedMovies,
  serverReviews = null,
  followerCount = 0,
  followingList = [],
  showCalendar = true,
  profileViews = { today: 0, total: 0 },
  userId = null,
  totalLikes = 0,
}: {
  myRatedMovies: MyRatedMovie[];
  // 로그인 계정의 DB 리뷰 전체 — 있으면 이 기기의 localStorage를 이 값으로 맞춘다.
  serverReviews?: SyncedReview[] | null;
  followerCount?: number;
  followingList?: FollowingUser[];
  showCalendar?: boolean;
  profileViews?: { today: number; total: number };
  userId?: string | null;
  totalLikes?: number;
}) {
  // 렌더 초입에 스토리지 키를 계정별로 격리 — 이 줄이 useSyncExternalStore 훅보다
  // 먼저 실행되어야 첫 렌더부터 올바른 계정 데이터를 읽는다.
  initForUser(userId);

  // 다른 기기에서 추가·삭제한 평점이 이 기기에도 반영되도록 DB 기준으로 맞춘다.
  useEffect(() => {
    if (!userId || !serverReviews) return;
    replaceWithServerReviews(serverReviews);
  }, [userId, serverReviews]);

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
  const reviewedById = new Map(reviewedMovies.map((m) => [m.id, m]));
  const myListMovies = myListIds
    .map((id) => reviewedById.get(id))
    .filter((movie): movie is ReviewedMovie => Boolean(movie));
  const addableMovies = reviewedMovies.filter((m) => !myListIds.includes(m.id));
  const [addSearch, setAddSearch] = useState("");
  const [addExpanded, setAddExpanded] = useState(false);
  const CHIP_THRESHOLD = 10; // 이 이하면 검색창·접기 없이 전부 표시
  const CHIP_PREVIEW = 8;   // 접힌 상태에서 보이는 칩 수
  const useCompact = addableMovies.length > CHIP_THRESHOLD;
  const filteredAddable = useCompact && addSearch.trim()
    ? addableMovies.filter((m) => m.title.toLowerCase().includes(addSearch.trim().toLowerCase()))
    : addableMovies;
  const visibleAddable = useCompact && !addExpanded
    ? filteredAddable.slice(0, CHIP_PREVIEW)
    : filteredAddable;
  const hiddenCount = filteredAddable.length - CHIP_PREVIEW;

  const awardMovieMap = new Map(
    myRatedMovies.filter((m) => m.festivalAwards && m.festivalAwards.length > 0).map((m) => [m.id, m.festivalAwards!])
  );
  const topRatedMovies = [...myMovieRatings].sort((a, b) => b.rating - a.rating);
  const recentRatedMovies = [...myMovieRatings].sort((a, b) => (a.ratedAt < b.ratedAt ? 1 : -1));

  // localStorage에 있지만 DB에 없는 항목도 "내가 평점 남긴 작품"에 포함
  const dbRatedIds = new Set(myRatedMovies.map((m) => m.id));
  const extraFromLocal = myMovieRatings
    .filter((m) => !dbRatedIds.has(m.id))
    .map((m) => ({ id: m.id, title: m.title, posterUrl: m.posterUrl, gradient: m.gradient, rating: m.rating, ratedAt: m.ratedAt }));
  const allRatedMovies = [...myRatedMovies, ...extraFromLocal];
  const myTier = getBadge(totalLikes);

  return (
    <div className="px-5 py-6">
      {showCalendar && <MovieDiaryCalendar reviews={myReviews} serverRatedMovies={myRatedMovies} userId={userId} />}

      {allRatedMovies.length > 0 && <RatedMovieSearch movies={allRatedMovies} />}

      <div className="mt-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-text">나만의 영화 리스트</h1>
          <p className="mt-1 text-xs text-muted">
            오늘 조회수 {profileViews.today} · 전체 조회수 {profileViews.total}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`rounded-full border px-3 py-1.5 text-xs font-bold ${TIER_STYLES[myTier].border} ${TIER_STYLES[myTier].text} ${TIER_STYLES[myTier].bg}`}>
            {myTier}
          </span>
          <span className="rounded-full border border-brand px-3 py-1.5 text-xs font-semibold text-brand">
            팔로워 {followerCount}
          </span>
          <span className="rounded-full border border-star px-3 py-1.5 text-xs font-semibold text-star">
            ♥ {totalLikes}
          </span>
        </div>
      </div>

      {topRatedMovies.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold text-text">내가 높게 평가한 작품</h2>
          <ScrollRow className="row-scrollbar mt-3 flex gap-4 overflow-x-auto pb-3">
            {topRatedMovies.map((movie) => (
              <MyRatedMovieCard key={movie.id} movie={movie} festivalAwards={awardMovieMap.get(movie.id)} />
            ))}
          </ScrollRow>
        </div>
      )}

      {recentRatedMovies.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold text-text">최근에 평가한 작품</h2>
          <ScrollRow className="row-scrollbar mt-3 flex gap-4 overflow-x-auto pb-3">
            {recentRatedMovies.map((movie) => (
              <MyRatedMovieCard key={`recent-${movie.id}`} movie={movie} festivalAwards={awardMovieMap.get(movie.id)} />
            ))}
          </ScrollRow>
        </div>
      )}

      <MyRatedMoviesSection movies={allRatedMovies} />

      <div className="mt-6">
        <MyStyleReport />
      </div>

      {addableMovies.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-muted">
            평점을 남긴 작품 중 추가하기
            {useCompact && <span className="ml-1 text-neutral-500">({addableMovies.length})</span>}
          </p>
          {useCompact && (
            <div className="relative mt-2">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              <input
                type="text"
                placeholder="영화 제목으로 검색"
                value={addSearch}
                onChange={(e) => { setAddSearch(e.target.value); setAddExpanded(false); }}
                className="w-full rounded-full border border-neutral-700 bg-transparent py-2 pl-9 pr-4 text-xs text-text placeholder-neutral-500 focus:border-brand focus:outline-none"
              />
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {visibleAddable.map((movie) => (
              <button
                key={movie.id}
                type="button"
                onClick={() => addToMyList(movie.id)}
                className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-text transition-colors hover:border-brand hover:text-brand"
              >
                + {movie.title}
              </button>
            ))}
            {useCompact && !addExpanded && hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setAddExpanded(true)}
                className="rounded-full border border-neutral-600 px-3 py-1.5 text-xs text-brand transition-colors hover:border-brand"
              >
                + {hiddenCount}개 더보기
              </button>
            )}
            {useCompact && addExpanded && (
              <button
                type="button"
                onClick={() => setAddExpanded(false)}
                className="rounded-full border border-neutral-600 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:border-neutral-500"
              >
                접기
              </button>
            )}
          </div>
          {useCompact && filteredAddable.length === 0 && (
            <p className="mt-2 text-xs text-muted">검색 결과가 없어요.</p>
          )}
        </div>
      )}

      <div className="mt-6 space-y-2">
        {myListMovies.length === 0 ? (
          <p className="text-sm text-muted">
            {reviewedMovies.length === 0 ? (
              <>
                평점을 남긴 영화가 아직 없어요. 영화에{" "}
                <Link prefetch={false} href="/" className="text-brand hover:underline">
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
              const tier = getBadge(user.totalLikes ?? 0);
              const tierStyle = TIER_STYLES[tier as Tier];
              return (
                <Link prefetch={false}
                  key={user.id}
                  href={`/users/${user.id}`}
                  className="flex items-center gap-3 rounded-lg bg-surface p-3 transition-colors hover:bg-surface/80"
                >
                  <span className={`shrink-0 rounded border px-2 py-1 text-xs font-bold ${tierStyle.border} ${tierStyle.text} ${tierStyle.bg}`}>
                    {tier}
                  </span>
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
