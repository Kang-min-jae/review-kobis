"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import StarRating from "./StarRating";
import { subscribe, getReviewsSnapshot, getSeedReviewsSnapshot, getAverageRating, getSeedAverageRating } from "../_lib/reviews-store";
import type { RowMovie } from "../_lib/movie-rows";
import { isRatableMovieId, rateHrefFor } from "../_lib/rating-input";

const SPACING_PX = 160;
const MAX_VISIBLE_OFFSET = 3;
const DRAG_ADVANCE_THRESHOLD_PX = 60;
const DRAG_MOVE_THRESHOLD_PX = 6;
// 짧게 "툭" 튕긴 스와이프도 넘어가게 하는 기준 — 손을 떼기 직전 속도(px/ms)와 최소 이동 거리.
const FLICK_VELOCITY = 0.35;
const FLICK_MIN_PX = 20;
// 한 번에 넘길 수 있는 최대 장수(길게 끌면 끈 거리만큼 여러 장을 넘긴다).
const MAX_STEPS_PER_SWIPE = 3;

function circularOffset(index: number, active: number, length: number): number {
  let diff = index - active;
  if (diff > length / 2) diff -= length;
  if (diff < -length / 2) diff += length;
  return diff;
}

function cardStyle(offset: number, dragOffsetPx: number, transitionEnabled: boolean): CSSProperties {
  // 드래그 중에는 손가락이 움직인 만큼(카드 간격 비율로) 위치를 연속으로 옮겨 회전·크기·투명도가
  // 함께 자연스럽게 바뀐다 — 예전엔 위치만 평행 이동하고 각도는 손을 뗄 때 한 번에 바뀌어 뻣뻣했다.
  const pos = offset + dragOffsetPx / SPACING_PX;
  const abs = Math.abs(pos);
  const transition = transitionEnabled ? "transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.45s ease-out" : "none";
  if (abs > MAX_VISIBLE_OFFSET + 1) {
    // 숨은 카드도 화면 밖 가장자리(보이는 마지막 자리 바로 바깥)에 둔다 — 예전엔 위치 없이 가운데에 숨어
    // 있다가, 다시 보일 때 가운데에서 옆으로 날아가며 회전판이 거꾸로 도는 것처럼 보였다.
    const edge = Math.sign(pos) * (MAX_VISIBLE_OFFSET + 1);
    return {
      transform: `translateX(${edge * SPACING_PX}px) translateZ(${-(MAX_VISIBLE_OFFSET + 1) * 90}px) scale(0.4)`,
      opacity: 0,
      pointerEvents: "none",
      zIndex: 0,
      transition,
    };
  }
  const scale = Math.max(1 - abs * 0.22, 0.4);
  const rotateY = Math.max(-50, Math.min(50, -pos * 26));
  const translateX = pos * SPACING_PX;
  const translateZ = -abs * 90;
  // 보이는 마지막 자리 너머(MAX ~ MAX+1)에서는 서서히 사라진다.
  const opacity = abs <= MAX_VISIBLE_OFFSET ? Math.max(1 - abs * 0.3, 0.15) : 0.15 * (MAX_VISIBLE_OFFSET + 1 - abs);
  return {
    transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
    opacity,
    zIndex: 100 - Math.round(abs * 2),
    pointerEvents: abs > MAX_VISIBLE_OFFSET ? "none" : undefined,
    transition,
  };
}

// 손을 뗐을 때 몇 장 넘길지 — 끈 거리를 카드 간격으로 나눠 반올림(길게 끌면 여러 장), 짧아도
// 기준 거리를 넘었거나 빠르게 튕겼으면 한 장. 왼쪽으로 끌면(delta < 0) 다음(+) 카드.
function swipeSteps(delta: number, samples: { x: number; t: number }[], upTime: number): number {
  const dir = delta < 0 ? 1 : -1;
  const byDistance = Math.min(MAX_STEPS_PER_SWIPE, Math.round(Math.abs(delta) / SPACING_PX));
  if (byDistance > 0) return dir * byDistance;
  const [a, b] = samples.length >= 2 ? samples : [samples[0], samples[0]];
  const velocity = a && b && b.t > a.t && upTime - b.t < 100 ? Math.abs(b.x - a.x) / (b.t - a.t) : 0;
  if (Math.abs(delta) > DRAG_ADVANCE_THRESHOLD_PX || (Math.abs(delta) > FLICK_MIN_PX && velocity > FLICK_VELOCITY)) return dir;
  return 0;
}

function parseBadge(badge: string | undefined): { primary: string | null; secondary: string | null } {
  if (!badge) return { primary: null, secondary: null };
  const [primary, ...rest] = badge.split(" · ");
  return { primary: primary ?? null, secondary: rest.join(" · ") || null };
}

function rateHref(movie: RowMovie): string {
  return rateHrefFor(movie.id);
}

function isRatable(movie: RowMovie): boolean {
  return isRatableMovieId(movie.id);
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
          <Link prefetch={false}
            href={`/theaters?movie=${movie.id}`}
            className="flex-1 whitespace-nowrap rounded-full border border-brand px-1 py-1.5 text-center text-[10px] font-semibold text-brand transition-colors hover:bg-brand hover:text-white"
          >
            🎫 예매
          </Link>
        )}
        {currentRatable ? (
          <Link prefetch={false}
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
  // 바로 전 중심 — 순환 목록의 끝에서 반대편으로 넘어가는 카드를 찾아 그 카드만 애니메이션 없이 옮긴다.
  const [prevActive, setPrevActive] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const dragStartXRef = useRef<number | null>(null);
  const dragStartYRef = useRef<number | null>(null);
  const directionRef = useRef<"h" | "v" | null>(null);
  const draggedRef = useRef(false);
  const pressedCardRef = useRef<{ index: number; offset: number } | null>(null);
  // 손을 떼기 직전 속도를 재기 위한 최근 두 지점(x, 시각).
  const samplesRef = useRef<{ x: number; t: number }[]>([]);

  const length = movies.length;

  const changeActive = useCallback(
    (next: number) => {
      setFlipped(false);
      setPrevActive(active);
      setActive(next);
    },
    [active]
  );

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
    dragStartYRef.current = e.clientY;
    samplesRef.current = [{ x: e.clientX, t: e.timeStamp }];
    directionRef.current = null;
    draggedRef.current = false;
    const cardEl = (e.target as HTMLElement).closest<HTMLElement>("[data-card-index]");
    pressedCardRef.current = cardEl
      ? { index: Number(cardEl.dataset.cardIndex), offset: Number(cardEl.dataset.cardOffset) }
      : null;
    // setPointerCapture는 수평 방향이 확정된 뒤에만 호출 — 여기서 즉시 호출하면
    // touch-pan-y가 있어도 브라우저 수직 스크롤이 막힌다.
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragStartXRef.current === null || dragStartYRef.current === null) return;
    const deltaX = e.clientX - dragStartXRef.current;
    const deltaY = e.clientY - dragStartYRef.current;
    if (directionRef.current === null) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        // 수직 이동 — 브라우저 스크롤에 위임하고 드래그 상태를 초기화
        directionRef.current = "v";
        dragStartXRef.current = null;
        dragStartYRef.current = null;
        pressedCardRef.current = null;
        return;
      }
      directionRef.current = "h";
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (directionRef.current !== "h") return;
    if (Math.abs(deltaX) > DRAG_MOVE_THRESHOLD_PX) draggedRef.current = true;
    samplesRef.current = [...samplesRef.current.slice(-1), { x: e.clientX, t: e.timeStamp }];
    setDragOffsetPx(deltaX);
  };
  // 브라우저가 터치를 가져가면(세로 스크롤 시작 등) pointercancel이 온다. 이때 좌표는 0일 수 있어
  // 손 뗌(pointerup)처럼 처리하면 엉뚱한 방향으로 넘어갔다 — 드래그만 취소하고 제자리로 돌린다.
  const onPointerCancel = () => {
    dragStartXRef.current = null;
    dragStartYRef.current = null;
    directionRef.current = null;
    pressedCardRef.current = null;
    setDragging(false);
    setDragOffsetPx(0);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragStartXRef.current === null) return;
    const delta = e.clientX - dragStartXRef.current;
    dragStartXRef.current = null;
    dragStartYRef.current = null;
    directionRef.current = null;
    setDragging(false);
    setDragOffsetPx(0);
    const steps = swipeSteps(delta, samplesRef.current, e.timeStamp);
    samplesRef.current = [];
    if (steps !== 0) {
      go(steps);
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
        className="absolute left-0 top-[155px] z-50 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-lg text-text transition-colors hover:bg-black/80 sm:top-[190px]"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="다음"
        onClick={() => go(1)}
        className="absolute right-0 top-[155px] z-50 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-lg text-text transition-colors hover:bg-black/80 sm:top-[190px]"
      >
        ›
      </button>

      <div
        className="flex h-[320px] touch-pan-y select-none items-center justify-center overflow-hidden [perspective:1400px] sm:h-[380px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className="relative h-[295px] w-[195px] [transform-style:preserve-3d] sm:h-[350px] sm:w-[230px]">
          {movies.map((movie, i) => {
            const offset = circularOffset(i, active, length);
              // 중심이 shift칸 움직였는데 이 카드가 그만큼이 아니라 반대편 끝으로 건너뛰었으면(순환) 애니메이션을 끈다.
              const shift = circularOffset(active, prevActive, length);
              const wrapped = circularOffset(i, prevActive, length) - shift !== offset;
            const { primary } = parseBadge(movie.badge);
            const isActiveCard = offset === 0;
            const isFlippedCard = isActiveCard && flipped;

            return (
              <div
                key={movie.id}
                data-card-index={i}
                data-card-offset={offset}
                className="absolute inset-0 cursor-pointer [transform-style:preserve-3d]"
                style={cardStyle(offset, dragOffsetPx, !dragging && !wrapped)}
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
          <Link prefetch={false} href={rateHref(current)} className="text-lg font-bold text-text hover:underline">
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
