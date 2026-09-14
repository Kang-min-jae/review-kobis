"use client";

import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import RatingSummary from "./RatingSummary";
import TopReviewsList from "./TopReviewsList";
import { useTopReviews } from "../_lib/use-top-reviews";
import type { RowMovie } from "../_lib/movie-rows";

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
  const [flipped, setFlipped] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const dragStartXRef = useRef<number | null>(null);
  // 이번 포인터 제스처가 "드래그"로 판정됐는지 — pointerup에서 읽어서, 드래그 끝에
  // 뒤집기/카드 이동이 오작동하지 않게 막는다.
  const draggedRef = useRef(false);
  // 어느 카드를 눌렀는지 pointerdown 시점에 기억해 둔다 — setPointerCapture를 컨테이너에
  // 걸어두면(드래그 추적용) 브라우저가 만드는 click 이벤트의 대상이 카드가 아니라
  // 컨테이너로 바뀌어버려서, 카드의 onClick이 아예 안 불릴 수 있다. 그래서 클릭 판정
  // 자체를 pointerup에서 이 값을 보고 직접 처리한다.
  const pressedCardRef = useRef<{ index: number; offset: number } | null>(null);

  const length = movies.length;
  const currentMovieCd = movies[active]?.id.startsWith("kobis-") ? movies[active].id.replace("kobis-", "") : null;
  const { reviews: topReviews, loading: reviewsLoading } = useTopReviews(currentMovieCd);

  // 중심(active)이 바뀌는 모든 경로(화살표, 드래그, 다른 카드 클릭, 점 인디케이터)가
  // 공통으로 거치는 함수 — 뒤집혀 있던 카드는 중심이 바뀌기 전에 항상 앞면으로 되돌린다.
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

  // 가운데 카드는 누르면 뒤집히고, 옆 카드는 누르면 그게 새 중심이 된다.
  const handleCardPress = (i: number, offset: number) => {
    if (offset === 0) {
      setFlipped((f) => !f);
    } else {
      changeActive(i);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // 뒷면의 예매/평점 버튼(data-no-drag) 위에서 시작한 제스처는 이 캐러셀 로직이
    // 아예 관여하지 않는다 — 링크의 기본 클릭 동작이 방해받지 않게 한다.
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
  const { rank: currentRank, detail: currentDetail } = parseBadge(current.badge);
  const isCurrentRatable = current.id.startsWith("kobis-") || current.id.startsWith("wikidata-") || current.id.startsWith("tmdb-tv-");

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
          onPointerCancel={onPointerUp}
        >
          <div className="relative h-[350px] w-[230px] [transform-style:preserve-3d]">
            {movies.map((movie, i) => {
              const offset = circularOffset(i, active, length);
              const { rank } = parseBadge(movie.badge);
              const isActiveCard = offset === 0;
              const isFlippedCard = isActiveCard && flipped;

              return (
                <div
                  key={movie.id}
                  data-card-index={i}
                  data-card-offset={offset}
                  className="absolute inset-0 cursor-pointer"
                  style={cardStyle(offset, dragOffsetPx, !dragging)}
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
                      {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} priority={i === 0} />}
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
                          <Link
                            href={`/theaters?movie=${movie.id}`}
                            className="flex-1 whitespace-nowrap rounded-full border border-brand px-1 py-1.5 text-center text-[10px] font-semibold text-brand transition-colors hover:bg-brand hover:text-white"
                          >
                            🎫 예매
                          </Link>
                        )}
                        {movie.id.startsWith("kobis-") || movie.id.startsWith("wikidata-") || movie.id.startsWith("tmdb-tv-") ? (
                          <Link
                            href={movie.id.startsWith("tmdb-tv-") ? `/series/${movie.id}/rate` : `/movies/${movie.id}/rate`}
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
            <Link
              href={current.id.startsWith("tmdb-tv-") ? `/series/${current.id}/rate` : `/movies/${current.id}/rate`}
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
            <RatingSummary movieId={current.id} shortAvg={current.shortAvg} longAvg={current.longAvg} />
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
