"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import ScrollRow from "./ScrollRow";
import StarRating from "./StarRating";
import MovieDiaryCalendar from "./MovieDiaryCalendar";
import MyRatedMoviesSection from "./MyRatedMoviesSection";
import UserStyleReport from "./UserStyleReport";
import UserReviewsPanel from "./UserReviewsPanel";
import type { MyRatedMovie } from "../_lib/my-rated-movies";
import type { UserReviewStats, UserReview } from "../_lib/review-data";
import AdminReviewSection from "./AdminReviewSection";

function UserReviewBottomSheet({
  movie,
  reviews,
  userName,
  href,
  onClose,
}: {
  movie: MyRatedMovie;
  reviews: UserReview[];
  userName: string;
  href: string;
  onClose: () => void;
}) {
  // ESC 키로 닫기
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = reviews.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 4);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-2xl bg-surface pb-safe shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* 핸들 바 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-neutral-600" />
        </div>

        <div className="p-5">
          {/* 헤더: 포스터 + 제목 + 별점 */}
          <div className="flex items-start gap-3">
            <div
              className={`relative h-20 w-14 shrink-0 overflow-hidden rounded-lg ${
                movie.posterUrl ? "bg-black" : `bg-gradient-to-br ${movie.gradient}`
              }`}
            >
              {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold leading-snug text-text">{movie.title}</p>
              <div className="mt-1.5">
                <StarRating rating={movie.rating} scale={10} size="h-3.5 w-3.5" />
              </div>
              <p className="mt-1 text-xs text-muted">{userName}님의 평론</p>
            </div>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="shrink-0 rounded-full p-1 text-lg leading-none text-muted hover:text-text"
            >
              ✕
            </button>
          </div>

          {/* 리뷰 목록 */}
          {shown.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {shown.map((review) => (
                <li key={review.id} className="rounded-xl bg-black/20 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted">
                      {review.category} · {review.type === "SHORT" ? "한줄평" : "장문평"}
                    </span>
                    <span className="text-[11px] font-bold text-star">★ {review.rating.toFixed(1)}</span>
                  </div>
                  {review.content.trim() ? (
                    <p className="mt-1 text-sm leading-relaxed text-text">{review.content}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted">평점만 남겼어요.</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">아직 남긴 리뷰가 없어요.</p>
          )}

          <Link prefetch={false}
            href={href}
            className="mt-4 block w-full rounded-full bg-brand/20 py-3 text-center text-sm font-semibold text-brand ring-1 ring-inset ring-brand/40 transition-colors hover:bg-brand/30"
          >
            평점 남기러 가기 →
          </Link>
        </div>
      </div>
    </>
  );
}

function movieCdFromId(id: string): string {
  return id.startsWith("kobis-") ? id.slice("kobis-".length) : id;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function UserMovieSearch({
  movies,
  userName,
  reviewMap,
}: {
  movies: MyRatedMovie[];
  userName: string;
  reviewMap: Map<string, UserReview[]>;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return movies.filter((m) => m.title.toLowerCase().includes(q)).slice(0, 10);
  }, [query, movies]);

  return (
    <div className="mt-6">
      <p className="mb-2 text-xs text-muted">{userName}님이 평점을 남긴 영화 검색</p>
      <div className="relative">
        <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
        <input
          type="text"
          placeholder="영화 제목으로 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-neutral-700 bg-surface py-2.5 pl-9 pr-9 text-sm text-text placeholder-neutral-500 focus:border-brand focus:outline-none"
        />
        {query && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500 hover:text-text"
          >
            ✕
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div className="mt-1 overflow-hidden rounded-lg border border-neutral-700 bg-surface">
          {results.map((movie) => {
            const href = movie.id.startsWith("tmdb-tv-")
              ? `/series/${movie.id}/rate`
              : `/movies/${movie.id}/rate`;
            const reviews = reviewMap.get(movieCdFromId(movie.id)) ?? [];
            const shortReview = reviews.find((r) => r.type === "SHORT" && r.content.trim());
            return (
              <Link prefetch={false}
                key={movie.id}
                href={href}
                className="flex items-center gap-3 border-b border-neutral-800 p-3 transition-colors last:border-b-0 hover:bg-black/30"
              >
                <div
                  className={`relative h-12 w-9 shrink-0 overflow-hidden rounded ${
                    movie.posterUrl ? "bg-black" : `bg-gradient-to-br ${movie.gradient}`
                  }`}
                >
                  {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{movie.title}</p>
                  {shortReview ? (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{shortReview.content}</p>
                  ) : (
                    <p className="text-[11px] text-muted">{userName}님의 평점</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-muted">{formatDate(movie.ratedAt)}</p>
                  <div className="mt-0.5">
                    <StarRating rating={movie.rating} scale={10} size="h-3 w-3" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {query.trim() && results.length === 0 && (
        <p className="mt-2 text-xs text-muted">검색 결과가 없어요.</p>
      )}
    </div>
  );
}

function ReadOnlyMovieCard({
  movie,
  reviewMap,
  userName,
}: {
  movie: MyRatedMovie;
  reviewMap: Map<string, UserReview[]>;
  userName: string;
}) {
  // 마우스 hover → 데스크톱 팝오버, 터치 탭 → 모바일 바텀시트
  const [revealSource, setRevealSource] = useState<"mouse" | "touch" | null>(null);
  const [panelSide, setPanelSide] = useState<"right" | "left">("right");
  const cardRef = useRef<HTMLDivElement>(null);
  const posterWrapRef = useRef<HTMLDivElement>(null);
  const lastPointerTypeRef = useRef<string>("");
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const movedRef = useRef(false);

  const href = movie.id.startsWith("tmdb-tv-") ? `/series/${movie.id}/rate` : `/movies/${movie.id}/rate`;
  const reviews = reviewMap.get(movieCdFromId(movie.id)) ?? [];

  useEffect(() => {
    if (revealSource === "mouse" && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setPanelSide(window.innerWidth - rect.right < 240 ? "left" : "right");
    }
  }, [revealSource]);

  // passive 리스너로 이동 여부 추적 — 브라우저 스크롤 판단을 막지 않는다
  useEffect(() => {
    const el = posterWrapRef.current;
    if (!el) return;
    function onMove(e: PointerEvent) {
      if (touchStartXRef.current !== null && touchStartYRef.current !== null) {
        const dx = Math.abs(e.clientX - touchStartXRef.current);
        const dy = Math.abs(e.clientY - touchStartYRef.current);
        if (dx > 8 || dy > 8) movedRef.current = true;
      }
    }
    function onCancel() { movedRef.current = true; }
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointercancel", onCancel, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointercancel", onCancel);
    };
  }, []);

  return (
    <div
      ref={cardRef}
      className="relative w-32 shrink-0"
      onMouseEnter={() => setRevealSource("mouse")}
      onMouseLeave={() => { if (revealSource === "mouse") setRevealSource(null); }}
    >
      <div ref={posterWrapRef}
        onPointerDown={(e) => {
          lastPointerTypeRef.current = e.pointerType;
          touchStartXRef.current = e.clientX;
          touchStartYRef.current = e.clientY;
          movedRef.current = false;
        }}
      >
        <Link prefetch={false}
          href={href}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className={`relative block aspect-2/3 touch-auto overflow-hidden rounded-lg ${
            movie.posterUrl ? "bg-surface" : `bg-gradient-to-br ${movie.gradient}`
          }`}
          onClick={(e) => {
            if (lastPointerTypeRef.current === "touch" && !movedRef.current) {
              e.preventDefault();
              setRevealSource((v) => (v === "touch" ? null : "touch"));
            }
          }}
        >
          {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
        </Link>
      </div>
      <p className="mt-2 line-clamp-2 text-xs font-medium text-text">{movie.title}</p>
      <div className="mt-1">
        <StarRating rating={movie.rating} scale={10} size="h-3 w-3" />
      </div>

      {/* 데스크톱: hover 팝오버 */}
      {revealSource === "mouse" && reviews.length > 0 && (
        <UserReviewsPanel reviews={reviews} userName={userName} side={panelSide} />
      )}

      {/* 모바일: 탭 시 바텀시트 */}
      {revealSource === "touch" && (
        <UserReviewBottomSheet
          movie={movie}
          reviews={reviews}
          userName={userName}
          href={href}
          onClose={() => setRevealSource(null)}
        />
      )}
    </div>
  );
}

export default function UserReadOnlyListView({
  movies,
  userName,
  reviewStats,
  userReviews,
  isAdmin = false,
  profileUserId,
}: {
  movies: MyRatedMovie[];
  userName: string;
  reviewStats: UserReviewStats;
  userReviews: UserReview[];
  isAdmin?: boolean;
  profileUserId?: string;
}) {
  const reviewMap = new Map<string, UserReview[]>();
  for (const review of userReviews) {
    const arr = reviewMap.get(review.movieCd) ?? [];
    arr.push(review);
    reviewMap.set(review.movieCd, arr);
  }

  const topRated = [...movies].sort((a, b) => b.rating - a.rating);
  const recentRated = [...movies].sort((a, b) => (a.ratedAt < b.ratedAt ? 1 : -1));

  if (movies.length === 0) {
    return (
      <div className="px-5 py-6 text-sm text-muted">
        {userName}님이 아직 평가한 영화가 없어요.
      </div>
    );
  }

  return (
    <div className="px-5 py-6">
      <MovieDiaryCalendar reviews={[]} serverRatedMovies={movies} readOnly />

      <UserMovieSearch movies={movies} userName={userName} reviewMap={reviewMap} />

      {topRated.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold text-text">{userName}님이 높게 평가한 작품</h2>
          <ScrollRow className="row-scrollbar mt-3 flex gap-4 overflow-x-auto pb-3">
            {topRated.map((movie) => (
              <ReadOnlyMovieCard key={movie.id} movie={movie} reviewMap={reviewMap} userName={userName} />
            ))}
          </ScrollRow>
        </div>
      )}

      {recentRated.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold text-text">최근에 평가한 작품</h2>
          <ScrollRow className="row-scrollbar mt-3 flex gap-4 overflow-x-auto pb-3">
            {recentRated.map((movie) => (
              <ReadOnlyMovieCard key={`recent-${movie.id}`} movie={movie} reviewMap={reviewMap} userName={userName} />
            ))}
          </ScrollRow>
        </div>
      )}

      <MyRatedMoviesSection movies={movies} userName={userName} />

      <div className="mt-6">
        <UserStyleReport
          stats={reviewStats}
          userName={userName}
          topMovies={[...movies].sort((a, b) => b.rating - a.rating).slice(0, 10)}
        />
      </div>

      {isAdmin && profileUserId && userReviews.length > 0 && (
        <div className="mt-6">
          <AdminReviewSection reviews={userReviews} profileUserId={profileUserId} />
        </div>
      )}
    </div>
  );
}
