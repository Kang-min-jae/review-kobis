"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import StarRating from "./StarRating";
import { subscribe, getReviewsSnapshot, getSeedReviewsSnapshot, getAverageRating, getSeedAverageRating } from "../_lib/reviews-store";
import type { RowMovie } from "../_lib/movie-rows";

const SPACING_PX = 190;
const MAX_VISIBLE_OFFSET = 3;
const DRAG_ADVANCE_THRESHOLD_PX = 60;
const DRAG_MOVE_THRESHOLD_PX = 6;

function circularOffset(index: number, active: number, length: number): number {
  let diff = index - active;
  if (diff > length / 2) diff -= length;
  if (diff < -length / 2) diff += length;
  return diff;
}

function cardStyle(offset: number, dragOffsetPx: number, transitionEnabled: boolean): CSSProperties {
  const abs = Math.abs(offset);
  if (abs > MAX_VISIBLE_OFFSET) {
    return { opacity: 0, pointerEvents: "none" };
  }
  const scale = Math.max(1 - abs * 0.22, 0.4);
  const rotateY = Math.max(-50, Math.min(50, -offset * 26));
  const translateX = offset * SPACING_PX + dragOffsetPx;
  const translateZ = -abs * 90;
  const opacity = Math.max(1 - abs * 0.3, 0.15);
  return {
    transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
    opacity,
    zIndex: 100 - abs,
    transition: transitionEnabled ? "transform 0.5s ease-out, opacity 0.5s ease-out" : "none",
  };
}

function parseBadge(badge: string | undefined): { primary: string | null; secondary: string | null } {
  if (!badge) return { primary: null, secondary: null };
  const [primary, ...rest] = badge.split(" · ");
  return { primary: primary ?? null, secondary: rest.join(" · ") || null };
}

function rateHref(movie: RowMovie): string {
  if (movie.id.startsWith("tmdb-tv-")) return `/series/${movie.id}/rate`;
  return `/movies/${movie.id}/rate`;
}

function isRatable(movie: RowMovie): boolean {
  return movie.id.startsWith("kobis-") || movie.id.startsWith("tmdb-tv-") || movie.id.startsWith("wikidata-");
}

// 카드 뒤집기 시 보이는 뒷면 — 실제 사용자 리뷰 + 평점 버튼
function CardBack({ movie, currentRatable }: { movie: RowMovie; currentRatable: boolean }) {
  const allReviews = useSyncExternalStore(
    subscribe,
    () => getReviewsSnapshot(movie.id, "short"),
    () => getSeedReviewsSnapshot(movie.id, "short"),
  );
  const reviews = allReviews.slice(0, 3);
  const avgRating = useSyncExternalStore(
    subscribe,
    () => getAverageRating(movie.id, "short"),
    () => getSeedAverageRating(movie.id, "short"),
  );

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden rounded-xl bg-surface p-3 shadow-2xl ring-2 ring-star/70 [backface-visibility:hidden] [transform:rotateY(180deg)]">
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold text-text">평론</p>
        {avgRating !== null && <StarRating rating={avgRating} scale={10} size="h-3 w-3" />}
      </div>

      <div className="mt-2 flex-1 space-y-2.5 overflow-y-auto">
        {reviews.length === 0 ? (
          <p className="mt-2 text-center text-xs text-muted">아직 평론이 없어요.</p>
        ) : (
          reviews.map((r) => (
            <div key={r.id} className="flex gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-[10px] font-semibold text-text">
                {r.authorName.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-semibold text-text">{r.authorName}</span>
                  <span className="text-[10px] font-bold text-star">★ {r.rating}</span>
                </div>
                {r.content && (
                  <p className="line-clamp-2 text-[10px] leading-relaxed text-muted">{r.content}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-2 flex gap-1.5" data-no-drag>
        {movie.isNowShowing && (
          <Link
            href={`/theaters?movie=${movie.id}`}
            className="flex-1 whitespace-nowrap rounded-full border border-brand px-1 py-1.5 text-center text-[10px] font-semibold text-brand transition-colors hover:bg-brand hover:text-white"
          >
            🎫 예매
          </Link>
        )}
        {currentRatable ? (
          <Link
            href={rateHref(movie)}
            className="flex-1 whitespace-nowrap rounded-full border border-star px-1 py-1.5 text-center text-[10px] font-semibold text-star transition-colors hover:bg-star hover:text-black"
          >
            ★ 평점
          </Link>
        ) : (
          <span className="flex-1 whitespace-nowrap rounded-full border border-neutral-600 px-1 py-1.5 text-center text-[10px] font-semibold text-muted">
            평점 준비중
          </span>
        )}
      </div>
    </div>
  );
}

export default function CoverflowCarousel({
  movies,
  hint,
}: {
  movies: RowMovie[];
  hint?: string;
}) {
  const [active, setActive] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const dragStartXRef = useRef<number | null>(null);
  const draggedRef = useRef(false);
  const pressedCardRef = useRef<{ index: number; offset: number } | null>(null);

  const length = movies.length;

  const changeActive = useCallback((next: number) => {
    setFlipped(false);
    setActive(next);
  }, []);

  const go = useCallback(
    (delta: number) => {
      changeActive((active + delta + length) % length);
    },
    [active, length, changeActive]
  );

  if (length === 0) return null;

  const handleCardPress = (i: number, offset: number) => {
    if (offset === 0) {
      setFlipped((f) => !f);
    } else {
      changeActive(i);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) {
      pressedCardRef.current = null;
      return;
    }
    dragStartXRef.current = e.clientX;
    draggedRef.current = false;
    setDragging(true);
    const cardEl = (e.target as HTMLElement).closest<HTMLElement>("[data-card-index]");
    pressedCardRef.current = cardEl
      ? { index: Number(cardEl.dataset.cardIndex), offset: Number(cardEl.dataset.cardOffset) }
      : null;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragStartXRef.current === null) return;
    const delta = e.clientX - dragStartXRef.current;
    if (Math.abs(delta) > DRAG_MOVE_THRESHOLD_PX) draggedRef.current = true;
    setDragOffsetPx(delta);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragStartXRef.current === null) return;
    const delta = e.clientX - dragStartXRef.current;
    dragStartXRef.current = null;
    setDragging(false);
    setDragOffsetPx(0);
    if (Math.abs(delta) > DRAG_ADVANCE_THRESHOLD_PX) {
      go(delta > 0 ? -1 : 1);
    } else if (!draggedRef.current && pressedCardRef.current) {
      handleCardPress(pressedCardRef.current.index, pressedCardRef.current.offset);
    }
    pressedCardRef.current = null;
  };

  const current = movies[active];
  const { primary: currentPrimary, secondary: currentSecondary } = parseBadge(current.badge);
  const currentRatable = isRatable(current);

  return (
    <div className="relative mt-4">
      <button
        type="button"
        aria-label="이전"
        onClick={() => go(-1)}
        className="absolute left-0 top-[190px] z-50 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-lg text-text transition-colors hover:bg-black/80"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="다음"
        onClick={() => go(1)}
        className="absolute right-0 top-[190px] z-50 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-lg text-text transition-colors hover:bg-black/80"
      >
        ›
      </button>

      <div
        className="flex h-[380px] touch-pan-y select-none items-center justify-center overflow-hidden [perspective:1400px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="relative h-[350px] w-[230px] [transform-style:preserve-3d]">
          {movies.map((movie, i) => {
            const offset = circularOffset(i, active, length);
            const { primary } = parseBadge(movie.badge);
            const isActiveCard = offset === 0;
            const isFlippedCard = isActiveCard && flipped;

            return (
              <div
                key={movie.id}
                data-card-index={i}
                data-card-offset={offset}
                className="absolute inset-0 cursor-pointer [transform-style:preserve-3d]"
                style={cardStyle(offset, dragOffsetPx, !dragging)}
              >
                {isActiveCard ? (
                  // 가운데 카드: 뒤집기 래퍼 (앞/뒷면 분리)
                  <div
                    className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
                    style={{ transform: isFlippedCard ? "rotateY(180deg)" : "rotateY(0deg)" }}
                  >
                    {/* 앞면 */}
                    <div
                      className={`absolute inset-0 overflow-hidden rounded-xl shadow-2xl [backface-visibility:hidden] ring-2 ring-star/70 ${
                        movie.posterUrl ? "bg-surface" : `bg-gradient-to-br ${movie.gradient}`
                      }`}
                    >
                      {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} priority={i < 3} />}
                      {primary && (
                        <span className="absolute left-2 top-2 rounded-full bg-star px-2 py-1 text-xs font-bold text-black">
                          {primary}
                        </span>
                      )}
                      {/* 클릭 유도 힌트 오버레이 */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 text-center text-[10px] text-white/70">
                        눌러서 평론 보기
                      </div>
                    </div>
                    {/* 뒷면 */}
                    <CardBack movie={movie} currentRatable={currentRatable} />
                  </div>
                ) : (
                  // 옆 카드: 앞면만
                  <div
                    className={`relative h-full w-full overflow-hidden rounded-xl shadow-2xl ${
                      movie.posterUrl ? "bg-surface" : `bg-gradient-to-br ${movie.gradient}`
                    }`}
                  >
                    {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} priority={i < 3} />}
                    {primary && (
                      <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs font-bold text-star">
                        {primary}
                      </span>
                    )}
                    <div className="absolute inset-0 bg-black/35" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 현재 카드 제목 + 배지 */}
      <div className="mt-5 text-center">
        {currentRatable ? (
          <Link href={rateHref(current)} className="text-lg font-bold text-text hover:underline">
            {current.title}
          </Link>
        ) : (
          <p className="text-lg font-bold text-text">{current.title}</p>
        )}
        {(currentPrimary || currentSecondary) && (
          <p className="mt-1 text-sm text-muted">
            {currentPrimary}
            {currentPrimary && currentSecondary ? " · " : ""}
            {currentSecondary}
          </p>
        )}
      </div>

      {/* 점 인디케이터 */}
      <div className="mt-4 flex justify-center gap-1.5">
        {movies.map((movie, i) => (
          <button
            key={movie.id}
            type="button"
            aria-label={`${i + 1}번째 항목으로 이동`}
            onClick={() => changeActive(i)}
            className={`h-1.5 rounded-full transition-all ${i === active ? "w-5 bg-star" : "w-1.5 bg-neutral-600"}`}
          />
        ))}
      </div>

      {hint && <p className="mt-2 text-center text-xs text-muted">{hint}</p>}
    </div>
  );
}
