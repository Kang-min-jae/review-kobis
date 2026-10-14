"use client";

import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import RatingSummary from "./RatingSummary";
import TopReviewsList from "./TopReviewsList";
import { useTopReviews } from "../_lib/use-top-reviews";
import type { RowMovie } from "../_lib/movie-rows";
import { isRatableMovieId, rateHrefFor } from "../_lib/rating-input";

// 카드 사이 간격/각도 값 — 화면에 한 번에 3~4장 정도(가운데 1장 + 양옆 1~2장)만
// 또렷하게 보이고, 그보다 먼 카드는 점점 작아지고 옆으로 돌아가며 흐려지다가
// MAX_VISIBLE_OFFSET을 넘어가면 아예 숨긴다(너무 많이 그리면 산만해진다).
const SPACING_PX = 190;
const MAX_VISIBLE_OFFSET = 3;
// 손을 뗐을 때 실제로 옆 카드로 넘어갈지 판단하는 기준(더 크게 움직여야 넘어간다).
const DRAG_ADVANCE_THRESHOLD_PX = 60;
// 클릭인지 드래그인지 구분하는 기준(이보다 조금이라도 더 움직이면 "드래그"로 보고,
// 손을 뗀 뒤 이어지는 클릭 이벤트로 뒤집기/카드 이동이 오작동하지 않게 막는다).
const DRAG_MOVE_THRESHOLD_PX = 6;
// 짧게 "툭" 튕긴 스와이프도 넘어가게 하는 기준 — 손을 떼기 직전 속도(px/ms)와 최소 이동 거리.
const FLICK_VELOCITY = 0.35;
const FLICK_MIN_PX = 20;
// 한 번에 넘길 수 있는 최대 장수(길게 끌면 끈 거리만큼 여러 장을 넘긴다).
const MAX_STEPS_PER_SWIPE = 3;

// 배열 순서(1위, 2위, ... 10위)를 원형으로 취급해서, 가운데(active)의 바로 오른쪽엔
// 다음 순위가, 바로 왼쪽엔 배열 끝(10위 등)이 자연스럽게 오도록 최단 방향의 거리를
// 계산한다 — 순위 목록이 하나의 회전판처럼 이어지는 느낌을 준다.
function circularOffset(index: number, active: number, length: number): number {
  let diff = index - active;
  if (diff > length / 2) diff -= length;
  if (diff < -length / 2) diff += length;
  return diff;
}

// 카드의 "캐러셀 위치"(순서상 몇 번째 자리인지)만 담당하는 스타일 — 뒤집기(Y축 180도)는
// 이 트랜스폼과 완전히 별개인 안쪽 래퍼가 맡는다(요구사항: 위치·각도 변환과 뒤집기는
// 서로 독립적으로 동작해야 함). dragOffsetPx는 드래그 중 커서를 따라가는 실시간
// 보정값이고, transitionEnabled가 꺼져 있으면(드래그 도중) 트랜지션 없이 즉시 반영된다.
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

// badge는 "1위 · 누적 10,027,997명" 형태의 완성 문자열이라(movie-rows.ts에서 만들어짐),
// 순위 배지와 나머지 설명을 나눠서 각각 다르게(순위는 눈에 띄게) 보여주려고 다시 쪼갠다.
function parseBadge(badge: string | undefined): { rank: string | null; detail: string | null } {
  if (!badge) return { rank: null, detail: null };
  const [rank, ...rest] = badge.split(" · ");
  return { rank: rank ?? null, detail: rest.join(" · ") || null };
}

export default function BoxOfficeCoverflow({
  title,
  subtitle,
  movies,
}: {
  title?: string;
  subtitle?: string;
  movies: RowMovie[];
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
  const currentMovieCd = movies[active]?.id.startsWith("kobis-") ? movies[active].id.replace("kobis-", "") : null;
  const { reviews: topReviews, loading: reviewsLoading } = useTopReviews(currentMovieCd);

  // 중심(active)이 바뀌는 모든 경로(화살표, 드래그, 다른 카드 클릭, 점 인디케이터)가
  // 공통으로 거치는 함수 — 뒤집혀 있던 카드는 중심이 바뀌기 전에 항상 앞면으로 되돌린다.
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

  // 가운데 카드는 누르면 뒤집히고, 옆 카드는 누르면 그게 새 중심이 된다.
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
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragStartXRef.current === null || dragStartYRef.current === null) return;
    const deltaX = e.clientX - dragStartXRef.current;
    const deltaY = e.clientY - dragStartYRef.current;
    if (directionRef.current === null) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
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
  const { rank: currentRank, detail: currentDetail } = parseBadge(current.badge);
  const isCurrentRatable = isRatableMovieId(current.id);

  return (
    <section className="px-5 py-6">
      {title && <h2 className="text-lg font-bold text-text">{title}</h2>}
      {title && subtitle && <p className="mt-1 text-sm text-muted">{subtitle} · 드래그하거나 화살표로 넘겨보세요</p>}

      <div className="relative mt-6">
        <button
          type="button"
          aria-label="이전 순위"
          onClick={() => go(-1)}
          className="absolute left-0 top-[190px] z-50 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-lg text-text transition-colors hover:bg-black/80"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="다음 순위"
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
          onPointerCancel={onPointerCancel}
        >
          <div className="relative h-[350px] w-[230px] [transform-style:preserve-3d]">
            {movies.map((movie, i) => {
              const offset = circularOffset(i, active, length);
              // 중심이 shift칸 움직였는데 이 카드가 그만큼이 아니라 반대편 끝으로 건너뛰었으면(순환) 애니메이션을 끈다.
              const shift = circularOffset(active, prevActive, length);
              const wrapped = circularOffset(i, prevActive, length) - shift !== offset;
              const { rank } = parseBadge(movie.badge);
              const isActiveCard = offset === 0;
              const isFlippedCard = isActiveCard && flipped;

              return (
                <div
                  key={movie.id}
                  data-card-index={i}
                  data-card-offset={offset}
                  className="absolute inset-0 cursor-pointer"
                  style={cardStyle(offset, dragOffsetPx, !dragging && !wrapped)}
                >
                  {/* 뒤집기 전용 안쪽 래퍼 — 위치/각도(캐러셀) 트랜스폼과는 별개로,
                      Y축 180도 회전만 담당한다. */}
                  <div
                    className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
                    style={{ transform: isFlippedCard ? "rotateY(180deg)" : "rotateY(0deg)" }}
                  >
                    {/* 앞면: 포스터 */}
                    <div
                      className={`absolute inset-0 overflow-hidden rounded-xl shadow-2xl [backface-visibility:hidden] ${
                        movie.posterUrl ? "bg-surface" : `bg-gradient-to-br ${movie.gradient}`
                      } ${isActiveCard ? "ring-2 ring-star/70" : ""}`}
                    >
                      {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} priority={i < 3} />}
                      {rank && (
                        <span
                          className={`absolute left-2 top-2 rounded-full px-2 py-1 text-xs font-bold ${
                            isActiveCard ? "bg-star text-black" : "bg-black/70 text-star"
                          }`}
                        >
                          {rank}
                        </span>
                      )}
                      {!isActiveCard && <div className="absolute inset-0 bg-black/35" />}
                    </div>

                    {/* 뒷면: 한줄평 — backface-visibility:hidden이라 앞면이 보일 때는
                        화면에 그려지지 않는다(가운데 카드가 아니어도 안전).
                        데이터는 active 카드에 연결된 useTopReviews에서 오므로,
                        가운데가 아닌 카드가 우연히 보여도 늘 현재 중심 영화의 한줄평이 뜬다. */}
                    <div className="absolute inset-0 flex flex-col overflow-hidden rounded-xl bg-surface p-3 shadow-2xl ring-2 ring-star/70 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                      <p className="text-sm font-bold text-text">한줄평</p>
                      <div className="flex-1 overflow-y-auto">
                        {isActiveCard && <TopReviewsList reviews={topReviews} loading={reviewsLoading} />}
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
                        {isRatableMovieId(movie.id) ? (
                          <Link prefetch={false}
                            href={rateHrefFor(movie.id)}
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
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 text-center">
          {isCurrentRatable ? (
            <Link prefetch={false}
              href={rateHrefFor(current.id)}
              className="text-lg font-bold text-text hover:underline"
            >
              {current.title}
            </Link>
          ) : (
            <p className="text-lg font-bold text-text">{current.title}</p>
          )}
          {(currentRank || currentDetail) && (
            <p className="mt-1 text-sm text-muted">
              {currentRank}
              {currentRank && currentDetail ? " · " : ""}
              {currentDetail}
            </p>
          )}
          <div className="mt-2 flex justify-center">
            <RatingSummary movieId={current.id} shortAvg={current.shortAvg} longAvg={current.longAvg} shortCount={current.shortCount} />
          </div>
        </div>

        <div className="mt-4 flex justify-center gap-1.5">
          {movies.map((movie, i) => (
            <button
              key={movie.id}
              type="button"
              aria-label={`${i + 1}번째 순위로 이동`}
              onClick={() => changeActive(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-5 bg-star" : "w-1.5 bg-neutral-600"
              }`}
            />
          ))}
        </div>

        <p className="mt-2 text-center text-xs text-muted">← 드래그해서 회전 → · 가운데 카드를 클릭하면 한줄평이 보여요</p>
      </div>
    </section>
  );
}
