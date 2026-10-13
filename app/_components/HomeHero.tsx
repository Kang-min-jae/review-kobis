"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PosterImage from "./PosterImage";
import { TIER_STYLES, type Tier } from "../_lib/tier";
import { toggleReviewVote } from "../_lib/social-actions";
import type { HeroLists, HeroMovie, HeroTodayReview } from "../_lib/home-hero";

// 홈 상단 히어로. 처음엔 극장 의자 사진 + STILL THEATER 문구.
// "최근 인기 영화" / "오늘의 한줄평"을 누르면 의자 화면이 왼쪽으로 빠지고 영화 패널이 오른쪽에서 밀려 들어온다.
// 패널에선 오른쪽 아래 화살표로 5개까지 넘겨 본다. 버튼을 누른 뒤 이 영역에서 10초 동안 아무것도 누르지 않으면
// 패널이 오른쪽으로 빠지고 의자 화면이 왼쪽에서 다시 들어온다.

type Mode = "popular" | "today";
const IDLE_RETURN_MS = 10_000;

const MODE_LABELS: Record<Mode, { button: string; caption: string }> = {
  popular: { button: "최근 인기 영화", caption: "최근 인기 영화 · 최근 30일 평점 수 기준" },
  today: { button: "오늘의 한줄평", caption: "오늘의 한줄평 · 최근 7일 좋아요 많은 순" },
};

function TierBadge({ tier }: { tier: string }) {
  const style = TIER_STYLES[tier as Tier] ?? TIER_STYLES["관객"];
  return <span className={`shrink-0 rounded border px-1 py-px text-[9px] font-medium leading-none ${style.border} ${style.text}`}>{tier}</span>;
}

function MoviePanel({ movie, mode }: { movie: HeroMovie; mode: Mode }) {
  return (
    <div key={`${mode}-${movie.movieId}`} className="flex h-full min-h-0 gap-4 motion-safe:animate-[heroFadeIn_.35s_ease] md:gap-6">
      <Link
        href={`/movies/${movie.movieId}/rate`}
        className={`relative aspect-2/3 w-24 shrink-0 self-start overflow-hidden rounded-xl sm:w-32 md:w-auto md:self-stretch ${
          movie.posterUrl ? "bg-black" : `bg-gradient-to-br ${movie.gradient}`
        }`}
      >
        {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
        <span className="absolute left-2 top-2 rounded-full bg-star px-2 py-0.5 text-[11px] font-bold text-black">{movie.rank}위</span>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[11px] font-bold text-star">{MODE_LABELS[mode].caption}</p>
        <Link href={`/movies/${movie.movieId}/rate`} className="mt-1 line-clamp-2 text-xl font-bold text-text hover:underline md:text-2xl">
          {movie.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-lg font-bold text-star md:text-xl">★ {movie.average !== null ? movie.average.toFixed(1) : "-"}</span>
          <span className="text-xs text-muted">평가 {movie.ratingCount.toLocaleString("ko-KR")}개</span>
          <span className="text-xs text-muted">최근 30일 {movie.recentCount.toLocaleString("ko-KR")}명</span>
          {movie.audiAcc !== null && (
            <span className="text-xs text-muted">
              누적 관객 <span className="font-bold text-text">{movie.audiAcc.toLocaleString("ko-KR")}명</span>
            </span>
          )}
        </div>

        <p className="mt-3 text-[11px] text-muted">좋아요 많은 한줄평</p>
        <div className="mt-1.5 min-h-0 space-y-2 overflow-hidden">
          {movie.reviews.length === 0 ? (
            <p className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-muted">아직 한줄평이 없어요. 첫 한줄평을 남겨 보세요.</p>
          ) : (
            movie.reviews.map((r) => (
              <div key={r.id} className="rounded-xl border border-neutral-800 bg-black/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-star text-[10px] font-bold text-black">
                    {Array.from(r.authorName)[0]}
                  </span>
                  <span className="truncate text-xs font-semibold text-text">{r.authorName}</span>
                  <TierBadge tier={r.authorTier} />
                  <span className="shrink-0 text-xs font-bold text-star">★ {r.rating.toFixed(1)}</span>
                  <span className="ml-auto shrink-0 text-xs text-brand">♥ {r.likeCount}</span>
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-text md:line-clamp-2">{r.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.floor(diff / 60000));
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

function TodayReviewPanel({ review }: { review: HeroTodayReview }) {
  return (
    <div key={review.id} className="flex h-full min-h-0 flex-col motion-safe:animate-[heroFadeIn_.35s_ease]">
      <p className="text-[11px] font-bold text-star">{MODE_LABELS.today.caption}</p>
      <span aria-hidden="true" className="mt-1 -mb-2 h-8 font-serif text-5xl leading-none text-star">“</span>
      <blockquote className="line-clamp-3 text-lg font-bold leading-snug text-text md:text-2xl">{review.content}</blockquote>
      <div className="mt-3 flex min-w-0 items-center gap-2 text-xs">
        <Link href={`/users/${review.authorId}`} className="flex min-w-0 items-center gap-2 hover:underline">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-star text-[11px] font-bold text-black">
            {Array.from(review.authorName)[0]}
          </span>
          <span className="truncate font-semibold text-text">{review.authorName}</span>
        </Link>
        <TierBadge tier={review.authorTier} />
        <span className="shrink-0 font-bold text-star">★ {review.rating.toFixed(1)}</span>
        <span className="shrink-0 text-muted">· {timeAgo(review.createdAt)}</span>
      </div>
      <Link
        href={`/movies/${review.movieId}/rate`}
        className="mt-3 flex w-full max-w-sm items-center gap-3 rounded-xl border border-neutral-800 bg-black/30 p-2.5 transition-colors hover:border-neutral-600"
      >
        <span className="relative aspect-2/3 w-10 shrink-0 overflow-hidden rounded-md bg-neutral-800">
          {review.posterUrl && <PosterImage src={review.posterUrl} alt={`${review.movieTitle} 포스터`} />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-text">{review.movieTitle}</span>
          <span className="block text-[11px] text-muted">{review.genre ? `${review.genre} · ` : ""}영화 상세 보기 ›</span>
        </span>
      </Link>
    </div>
  );
}

// "공감" — 기존 리뷰 좋아요(toggleReviewVote)를 그대로 쓴다. 로그인 안 했으면 로그인 페이지로.
function LikeButton({ review, isLoggedIn, initiallyLiked }: { review: HeroTodayReview; isLoggedIn: boolean; initiallyLiked: boolean }) {
  const router = useRouter();
  const [liked, setLiked] = useState(initiallyLiked);
  const [count, setCount] = useState(review.likeCount);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!isLoggedIn) {
      router.push(`/login?callbackUrl=${encodeURIComponent("/")}`);
      return;
    }
    if (pending) return;
    const next = !liked;
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    setPending(true);
    try {
      await toggleReviewVote(review.id, "LIKE");
    } catch {
      setLiked(!next);
      setCount((c) => c + (next ? -1 : 1));
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors ${
        liked ? "border-brand text-brand" : "border-neutral-700 text-text hover:border-neutral-500"
      }`}
    >
      <span aria-hidden="true">{liked ? "♥" : "♡"}</span> 공감 {count}
    </button>
  );
}

export default function HomeHero({
  lists,
  isLoggedIn = false,
  likedReviewIds = [],
}: {
  lists: HeroLists | null;
  isLoggedIn?: boolean;
  likedReviewIds?: string[];
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  // 패널이 빠지는 동안에도 내용이 사라지지 않게 마지막으로 연 목록을 기억한다.
  const [shownMode, setShownMode] = useState<Mode>("popular");
  const [index, setIndex] = useState(0);
  const [activity, setActivity] = useState(0); // 이 영역에서 누를 때마다 바뀌어 10초 타이머를 다시 잰다

  const active = mode !== null;
  const movies = lists?.popular ?? [];
  const reviews = lists?.today ?? [];
  const total = shownMode === "popular" ? movies.length : reviews.length;
  const movie = shownMode === "popular" ? (movies[Math.min(index, movies.length - 1)] ?? null) : null;
  const review = shownMode === "today" ? (reviews[Math.min(index, reviews.length - 1)] ?? null) : null;

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setMode(null), IDLE_RETURN_MS);
    return () => window.clearTimeout(timer);
  }, [active, activity]);

  function open(next: Mode) {
    setMode(next);
    setShownMode(next);
    setIndex(0);
  }

  return (
    <section
      aria-label="STILL THEATER"
      onPointerDown={() => setActivity((n) => n + 1)}
      onKeyDown={() => setActivity((n) => n + 1)}
      className="relative h-[440px] overflow-hidden rounded-2xl border border-neutral-800 bg-black md:h-[430px]"
    >
      {/* 의자 사진 — 패널이 열리면 왼쪽으로 빠진다 */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 transition-[transform,opacity] duration-700 ease-in-out motion-reduce:transition-none ${
          active ? "-translate-x-1/3 opacity-0" : "translate-x-0 opacity-100"
        }`}
      >
        <Image src="/images/hero-theater.webp" alt="" fill priority sizes="100vw" className="object-cover object-[70%_50%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent md:via-black/40" />
      </div>

      {/* 왼쪽 문구·버튼 — 넓은 화면에선 항상 보이고, 모바일에선 패널이 덮는다 */}
      <div className="absolute inset-y-0 left-0 z-10 flex w-full flex-col justify-center px-6 sm:px-10 md:w-[42%] md:px-12">
        <h1 className="text-5xl font-black leading-[0.95] tracking-[0.08em] text-text md:text-6xl">
          STILL
          <br />
          THEATER
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-text/90 md:text-base">
          불이 켜져도 아직 일어나지 못한
          <br />
          마음을 남겨주세요
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {(Object.keys(MODE_LABELS) as Mode[]).map((m) => {
            const selected = mode === m || (mode === null && m === "popular");
            return (
              <button
                key={m}
                type="button"
                onClick={() => open(m)}
                disabled={!lists}
                aria-pressed={mode === m}
                aria-controls="home-hero-panel"
                className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-wait disabled:opacity-60 ${
                  selected ? "bg-star text-black hover:opacity-90" : "border border-star/60 text-text hover:border-star"
                }`}
              >
                {MODE_LABELS[m].button}
              </button>
            );
          })}
        </div>
      </div>

      {/* 영화 패널 — 오른쪽에서 밀려 들어온다 */}
      <div
        id="home-hero-panel"
        role="region"
        aria-label={MODE_LABELS[shownMode].button}
        aria-hidden={!active}
        inert={!active}
        className={`absolute inset-y-0 right-0 z-20 flex w-full flex-col bg-surface p-4 transition-transform duration-700 ease-in-out motion-reduce:transition-none sm:p-5 md:w-[58%] md:p-6 ${
          active ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setMode(null)}
          className="mb-2 self-start text-xs text-muted hover:text-text md:hidden"
        >
          ‹ 처음으로
        </button>

        <div className="min-h-0 flex-1">
          {movie ? (
            <MoviePanel movie={movie} mode={shownMode} />
          ) : review ? (
            <TodayReviewPanel review={review} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-[11px] font-bold text-star">{MODE_LABELS[shownMode].caption}</p>
              <p className="mt-2 text-sm text-muted">
                {shownMode === "popular" ? "최근 30일 동안 남겨진 평점이 아직 충분하지 않아요." : "최근 7일 동안 공감을 받은 한줄평이 아직 없어요."}
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          {movie ? (
            <Link
              href={`/movies/${movie.movieId}/rate`}
              className="rounded-xl bg-star px-4 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90"
            >
              ★ 별점 남기기
            </Link>
          ) : review ? (
            <div className="flex flex-wrap items-center gap-2">
              <LikeButton key={review.id} review={review} isLoggedIn={isLoggedIn} initiallyLiked={likedReviewIds.includes(review.id)} />
              <Link
                href={`/movies/${review.movieId}/rate`}
                className="flex h-10 items-center rounded-xl bg-star px-4 text-sm font-bold text-black transition-opacity hover:opacity-90"
              >
                나도 한줄평 남기기
              </Link>
            </div>
          ) : (
            <span />
          )}
          {total > 1 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label={shownMode === "popular" ? "이전 영화" : "이전 한줄평"}
                onClick={() => setIndex((i) => (i - 1 + total) % total)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700 text-text transition-colors hover:border-neutral-500"
              >
                ‹
              </button>
              <span className="min-w-[2.5rem] text-center text-sm text-muted" aria-live="polite">
                {index + 1} / {total}
              </span>
              <button
                type="button"
                aria-label={shownMode === "popular" ? "다음 영화" : "다음 한줄평"}
                onClick={() => setIndex((i) => (i + 1) % total)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700 text-text transition-colors hover:border-neutral-500"
              >
                ›
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
