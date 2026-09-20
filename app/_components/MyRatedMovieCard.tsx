"use client";

import { useState, useMemo, useRef, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import StarRating from "./StarRating";
import MyReviewsPanel from "./MyReviewsPanel";
import { subscribe, getMyReviewsSnapshot, getServerMyReviewsSnapshot } from "../_lib/reviews-store";
import type { MyMovieRating } from "../_lib/reviews-store";
import type { Review } from "../_lib/mock-reviews";
import type { FestivalAward } from "../_lib/movie-rows";

const FESTIVAL_KO: Record<string, string> = {
  academy: "아카데미상",
  cannes: "칸 영화제",
  berlin: "베를린 영화제",
  venice: "베니스 영화제",
};

function MyReviewBottomSheet({
  movie,
  reviews,
  onClose,
}: {
  movie: MyMovieRating;
  reviews: Review[];
  onClose: () => void;
}) {
  const rateHref = movie.id.startsWith("tmdb-tv-") ? `/series/${movie.id}/rate` : `/movies/${movie.id}/rate`;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = [...reviews].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 4);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-2xl bg-surface pb-safe shadow-2xl">
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-neutral-600" />
        </div>

        <div className="p-5">
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
              <p className="mt-1 text-xs text-muted">내 평론</p>
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

          {shown.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {shown.map((review) => (
                <li key={review.id} className="rounded-xl bg-black/20 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted">
                      {review.category} · {review.type === "short" ? "한줄평" : "장문평"}
                    </span>
                    <span className="text-[11px] font-bold text-star">
                      ★ {(review.rating / (review.type === "short" ? 10 : 100) * 10).toFixed(1)}
                    </span>
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

          <Link
            href={rateHref}
            className="mt-4 block w-full rounded-full bg-brand/20 py-3 text-center text-sm font-semibold text-brand ring-1 ring-inset ring-brand/40 transition-colors hover:bg-brand/30"
          >
            영화 상세 보러가기 →
          </Link>
        </div>
      </div>
    </>
  );
}

export default function MyRatedMovieCard({ movie, festivalAwards }: { movie: MyMovieRating; festivalAwards?: FestivalAward[] }) {
  const [revealSource, setRevealSource] = useState<"mouse" | "touch" | null>(null);
  const [awardTooltip, setAwardTooltip] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [panelSide, setPanelSide] = useState<"right" | "left">("right");
  const cardRef = useRef<HTMLDivElement>(null);
  const posterWrapRef = useRef<HTMLDivElement>(null);
  const lastPointerTypeRef = useRef<string>("");
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const movedRef = useRef(false);

  const allReviews = useSyncExternalStore(subscribe, getMyReviewsSnapshot, getServerMyReviewsSnapshot);
  const movieReviews = useMemo(
    () => allReviews.filter((r) => r.movieId === movie.id),
    [allReviews, movie.id]
  );

  const rateHref = movie.id.startsWith("tmdb-tv-") ? `/series/${movie.id}/rate` : `/movies/${movie.id}/rate`;

  useEffect(() => {
    if (revealSource === "mouse" && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setPanelSide(window.innerWidth - rect.right < 240 ? "left" : "right");
    }
  }, [revealSource]);

  // 모바일 바텀시트가 열린 상태에서 카드 바깥 탭으로 닫기
  useEffect(() => {
    if (revealSource !== "touch") return;
    function onOutside(e: PointerEvent) {
      if (e.pointerType === "touch") setRevealSource(null);
    }
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
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

  const hasAward = festivalAwards && festivalAwards.length > 0;

  const groupedAwards = useMemo(() => {
    if (!festivalAwards) return [];
    const map = new Map<string, { festival: string; year: number; categories: string[] }>();
    for (const a of festivalAwards) {
      const key = `${a.festival}|${a.year}`;
      const entry = map.get(key) ?? { festival: a.festival, year: a.year, categories: [] };
      if (a.categoryLabel && !entry.categories.includes(a.categoryLabel)) entry.categories.push(a.categoryLabel);
      map.set(key, entry);
    }
    return Array.from(map.values());
  }, [festivalAwards]);

  return (
    <div
      ref={cardRef}
      className="relative w-32 shrink-0"
      onMouseEnter={() => setRevealSource("mouse")}
      onMouseLeave={() => { if (revealSource === "mouse") setRevealSource(null); }}
    >
      <div
        ref={posterWrapRef}
        onPointerDown={(e) => {
          lastPointerTypeRef.current = e.pointerType;
          touchStartXRef.current = e.clientX;
          touchStartYRef.current = e.clientY;
          movedRef.current = false;
        }}
      >
        <Link
          href={rateHref}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className={`relative block aspect-2/3 touch-auto overflow-hidden rounded-lg ${
            movie.posterUrl && !posterFailed ? "bg-surface" : `bg-gradient-to-br ${movie.gradient}`
          }`}
          onClick={(e) => {
            if (lastPointerTypeRef.current === "touch" && !movedRef.current) {
              e.preventDefault();
              setRevealSource((v) => (v === "touch" ? null : "touch"));
            }
          }}
        >
          {movie.posterUrl && !posterFailed && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} onError={() => setPosterFailed(true)} />}
          {hasAward && groupedAwards.length > 0 && (
            <button
              type="button"
              aria-label={festivalAwards!.map((a) => `${FESTIVAL_KO[a.festival] ?? a.festival} ${a.categoryLabel} (${a.year})`).join(", ")}
              className="absolute right-1.5 top-1.5 flex cursor-pointer flex-col items-end gap-0.5"
              onMouseEnter={() => setAwardTooltip(true)}
              onMouseLeave={() => setAwardTooltip(false)}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAwardTooltip((v) => !v); }}
            >
              {groupedAwards.map((_, i) => (
                <span key={i} className="rounded-full bg-yellow-500/30 px-1.5 py-0.5 text-[11px] leading-none ring-1 ring-inset ring-yellow-400/50">
                  🏆
                </span>
              ))}
            </button>
          )}
        </Link>
      </div>

      <p className="mt-2 line-clamp-2 text-xs font-medium text-text">{movie.title}</p>
      <div className="mt-1">
        <StarRating rating={movie.rating} scale={10} size="h-3 w-3" />
      </div>

      {awardTooltip && groupedAwards.length > 0 && (
        <div
          className="absolute right-0 top-1 z-50 max-w-[200px] rounded-lg bg-black/90 p-2 text-[11px] text-white ring-1 ring-white/10"
          onMouseEnter={() => setAwardTooltip(true)}
          onMouseLeave={() => setAwardTooltip(false)}
        >
          {groupedAwards.map((g, i) => (
            <div key={i} className="py-0.5 leading-snug">
              <span className="font-semibold">{FESTIVAL_KO[g.festival] ?? g.festival}</span>{" "}
              <span className="text-white/60">{g.year}</span>
              {g.categories.length > 0 && (
                <> · <span className="text-yellow-300">{g.categories.join(", ")}</span></>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 데스크톱: hover 패널 */}
      {revealSource === "mouse" && <MyReviewsPanel movieId={movie.id} side={panelSide} />}

      {/* 모바일: 탭 시 바텀시트 */}
      {revealSource === "touch" && (
        <MyReviewBottomSheet
          movie={movie}
          reviews={movieReviews}
          onClose={() => setRevealSource(null)}
        />
      )}
    </div>
  );
}
