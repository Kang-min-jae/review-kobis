"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import RatingSummary from "./RatingSummary";
import HoverRating from "./HoverRating";
import TopLikedReview from "./TopLikedReview";
import TopReviewsPanel from "./TopReviewsPanel";
import type { RowMovie } from "../_lib/movie-rows";
import {
  subscribe as subscribeAffinity,
  getAffinitySnapshot,
  getCfBlendedSnapshot,
  getServerCfBlendedSnapshot,
  getServerAffinitySnapshot,
} from "../_lib/affinity-store";
import {
  subscribe as subscribeReviews,
  getMyReviewsSnapshot,
  getServerMyReviewsSnapshot,
} from "../_lib/reviews-store";
import { isRatableMovieId, rateHrefFor } from "../_lib/rating-input";

const CF_HINT = "취향이 비슷한 회원들의 평가가 일부 반영됐어요";

const FESTIVAL_KO: Record<string, string> = {
  academy: "아카데미상",
  cannes: "칸 영화제",
  berlin: "베를린 영화제",
  venice: "베니스 영화제",
};

export default function MovieCard({ movie, popoverSide = "right", priority = false }: { movie: RowMovie; popoverSide?: "left" | "right"; priority?: boolean }) {
  // 데스크톱은 마우스가 올라와 있는 동안, 모바일(마우스가 없어 hover가 안 됨)은
  // 한 번 탭하면 켜져서 다시 탭할 때까지 유지된다 — 예매/평점 버튼과 인기 한줄평
  // 패널이 전부 이 하나의 상태로 같이 열리고 닫힌다.
  const [revealed, setRevealed] = useState(false);
  const [awardTooltip, setAwardTooltip] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const movedRef = useRef(false);
  const lastPointerTypeRef = useRef<string>("");
  const cardRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!revealed) return;
    function onOutsideTouch(e: PointerEvent) {
      if (e.pointerType === "touch" && cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setRevealed(false);
      }
    }
    document.addEventListener("pointerdown", onOutsideTouch);
    return () => document.removeEventListener("pointerdown", onOutsideTouch);
  }, [revealed]);

  // passive 리스너로 등록해 브라우저의 스크롤 판단을 막지 않는다.
  useEffect(() => {
    const el = posterRef.current;
    if (!el) return;
    function onMove(e: PointerEvent) {
      if (touchStartXRef.current !== null && touchStartYRef.current !== null) {
        const dx = Math.abs(e.clientX - touchStartXRef.current);
        const dy = Math.abs(e.clientY - touchStartYRef.current);
        if (dx > 8 || dy > 8) movedRef.current = true;
      }
    }
    // 스크롤 시작 시 브라우저가 포인터를 취소하면 이동한 것으로 간주해 click 토글을 막는다.
    function onCancel() { movedRef.current = true; }
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointercancel", onCancel, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointercancel", onCancel);
    };
  }, []);
  // 필모그래피에는 KOBIS에 등록이 없는(평점 페이지로 연결할 movieCd가 없는) 작품도
  // 이제 포함된다(person-filmography.ts 참고) — 그런 카드는 id가 "kobis-"가 아니라
  // "kmdb-"로 시작한다. 평점 등록만 못 하게 막고, 카드 자체는 그대로 보여준다.
  // kmdb-* 도 평점 페이지로 연결한다 — resolveMovieRateInfo가 CachedMovie를 조회해
  // TMDB에서 정보를 보완하거나 KMDb 기본 정보만으로라도 평점 페이지를 제공한다. 수상작(wikidata-*)도 마찬가지.
  const isRatable = isRatableMovieId(movie.id);
  const rateHref = rateHrefFor(movie.id);

  const affinityScores = useSyncExternalStore(subscribeAffinity, getAffinitySnapshot, getServerAffinitySnapshot);
  const cfBlendedIds = useSyncExternalStore(subscribeAffinity, getCfBlendedSnapshot, getServerCfBlendedSnapshot);
  const myReviews = useSyncExternalStore(subscribeReviews, getMyReviewsSnapshot, getServerMyReviewsSnapshot);

  // 내가 이 영화에 남긴 "전체" 한줄평 평점 (있으면)
  const myMovieRating = useMemo(() => {
    const mine = myReviews.find(
      (r) => r.movieId === movie.id && r.type === "short" && (r.category ?? "전체") === "전체"
    );
    return mine ? mine.rating : null;
  }, [myReviews, movie.id]);

  // festival+year 로 묶어서 카테고리 목록을 하나로 합친 그룹
  const groupedAwards = useMemo(() => {
    if (!movie.festivalAwards) return [];
    const map = new Map<string, { festival: string; year: number; categories: string[] }>();
    for (const a of movie.festivalAwards) {
      const key = `${a.festival}|${a.year}`;
      const entry = map.get(key) ?? { festival: a.festival, year: a.year, categories: [] };
      if (a.categoryLabel && !entry.categories.includes(a.categoryLabel)) {
        entry.categories.push(a.categoryLabel);
      }
      map.set(key, entry);
    }
    return Array.from(map.values());
  }, [movie.festivalAwards]);

  // "추천 N%" — 서버가 calculateAffinity.ts의 같은 공식으로 계산한 추천도. 추천 행은 응답에
  // recommendScore가 실려 오고, 나머지 행은 affinity-store가 /api/affinity로 받아온다.
  // 예전엔 점수가 오기 전까지 브라우저에서 다른 공식(장르 겹침 비율)으로 임시 숫자를 띄웠다가
  // 서버 점수로 바뀌어 숫자가 튀었다 — 이제 근거 있는 점수가 있을 때만 보여준다.
  // 이미 평점을 남긴 영화는 추천 대상이 아니라 배지 대신 내 별점만 보인다.
  const recommendPercent = movie.recommendScore ?? affinityScores[movie.id] ?? null;
  // 협업 필터링이 섞인 점수일 때만 도움말을 단다(섞이지 않았으면 예전 배지 그대로).
  const recommendCf = movie.recommendScore != null ? movie.recommendCf === true : cfBlendedIds[movie.id] === true;
  const matchBadge =
    myMovieRating === null && recommendPercent !== null && recommendPercent > 0 ? `추천 ${recommendPercent}%` : null;

  return (
    <div
      className={`relative w-[130px] shrink-0 rounded-xl border border-white/15 bg-white/5 p-2 shadow-lg backdrop-blur-sm sm:w-40 ${
        revealed ? "z-10" : "z-0"
      }`}
      onPointerEnter={(e) => { if (e.pointerType !== "touch") setRevealed(true); }}
      onPointerLeave={(e) => { if (e.pointerType !== "touch") setRevealed(false); }}
      ref={cardRef}
    >
      <div
        ref={posterRef}
        className={`relative aspect-2/3 touch-auto overflow-hidden rounded-lg ${
          movie.posterUrl && !posterFailed ? "bg-black" : `bg-gradient-to-br ${movie.gradient}`
        }`}
        onPointerDown={(e) => {
          lastPointerTypeRef.current = e.pointerType;
          touchStartXRef.current = e.clientX;
          touchStartYRef.current = e.clientY;
          movedRef.current = false;
        }}
        onClick={() => {
          if (lastPointerTypeRef.current === "touch" && !movedRef.current) setRevealed((v) => !v);
        }}
      >
        {/* 카드 폭(130px/sm:160px)에서 p-2를 뺀 실제 포스터 폭 — 기본값 200px면 고해상도 폰이 640w를 받는다. */}
        {movie.posterUrl && !posterFailed && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} sizes="(min-width: 640px) 144px, 114px" priority={priority} onError={() => setPosterFailed(true)} />}
        {/* 왼쪽: 추천 % */}
        {matchBadge && (
          <span
            className="absolute left-1.5 top-1.5 rounded-full bg-brand/25 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-inset ring-brand/50"
            {...(recommendCf ? { title: CF_HINT } : {})}
          >
            {matchBadge}
            {recommendCf && <span className="sr-only"> ({CF_HINT})</span>}
          </span>
        )}
        {/* 우측 상단: 트로피 (수상작) + 순위·재개봉일 배지 세로 스택 */}
        {(movie.awardBadge || movie.badge) && (
          <div className="absolute right-1.5 top-1.5 flex flex-col items-end gap-1">
            {movie.awardBadge && groupedAwards.length > 0 && (
              <button
                type="button"
                aria-label={movie.festivalAwards?.map((a) => `${FESTIVAL_KO[a.festival] ?? a.festival} ${a.categoryLabel} (${a.year})`).join(", ") ?? "영화제 수상작"}
                className="flex cursor-pointer flex-col items-end gap-0.5"
                onPointerEnter={(e) => { if (e.pointerType !== "touch") setAwardTooltip(true); }}
                onPointerLeave={(e) => { if (e.pointerType !== "touch") setAwardTooltip(false); }}
                onClick={(e) => { e.stopPropagation(); setAwardTooltip((v) => !v); }}
              >
                {groupedAwards.map((_, i) => (
                  <span key={i} className="rounded-full bg-yellow-500/30 px-1.5 py-0.5 text-[11px] leading-none ring-1 ring-inset ring-yellow-400/50">
                    🏆
                  </span>
                ))}
              </button>
            )}
            {movie.badge && (
              <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-inset ring-white/20">
                {movie.badge}
              </span>
            )}
          </div>
        )}
        <HoverRating movieId={movie.id} myRating={myMovieRating} />

        {/* 포스터에 마우스를 올렸을 때(데스크톱) 또는 탭했을 때(모바일)만 나타나는
            예매/평점 바로가기. 안 보일 땐 pointer-events-none이라 숨어있는 버튼이
            먼저 탭을 가로채지 않고, 위 onClick으로 넘어가 열리기만 한다. */}
        <div
          className={`absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/20 to-black/40 transition-opacity duration-200 ${
            revealed ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div className="flex gap-1.5 p-2">
            {movie.isNowShowing && (
              <Link prefetch={false}
                href={`/theaters?movie=${movie.id}`}
                className="flex-1 whitespace-nowrap rounded-full border border-brand bg-black/50 px-1 py-1.5 text-center text-[10px] font-semibold text-brand transition-colors hover:bg-brand hover:text-white"
              >
                🎫 예매
              </Link>
            )}
            {isRatable ? (
              <Link prefetch={false}
                href={rateHref}
                className={`flex-1 whitespace-nowrap rounded-full border border-star px-1 py-1.5 text-center text-[10px] font-semibold transition-colors hover:bg-star hover:text-black ${
                  myMovieRating !== null ? "bg-star/25 text-star" : "bg-black/50 text-star"
                }`}
              >
                {myMovieRating !== null ? `★ ${myMovieRating.toFixed(1)}점` : "★ 평점"}
              </Link>
            ) : (
              <span className="flex-1 whitespace-nowrap rounded-full border border-neutral-600 bg-black/50 px-1 py-1.5 text-center text-[10px] font-semibold text-muted">
                평점 준비중
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2.5 space-y-1.5 px-0.5 pb-1">
        <p className="line-clamp-2 text-sm font-bold text-text">{movie.title}</p>
        {(movie.recommendReason ?? movie.genre) && (
          <p className="text-xs text-sky-400">{movie.recommendReason ?? movie.genre}</p>
        )}
        <RatingSummary movieId={movie.id} shortAvg={movie.shortAvg} longAvg={movie.longAvg} shortCount={movie.shortCount} />
        <TopLikedReview movieId={movie.id} />
      </div>

      {/* 수상 내역 툴팁 — overflow-hidden 포스터 div 밖에 렌더해 클리핑 없이 보인다 */}
      {awardTooltip && groupedAwards.length > 0 && (
        <div
          className="absolute right-0 top-1 z-50 max-w-[220px] rounded-lg bg-black/90 p-2 text-[11px] text-white ring-1 ring-white/10"
          onPointerEnter={(e) => { if (e.pointerType !== "touch") setAwardTooltip(true); }}
          onPointerLeave={(e) => { if (e.pointerType !== "touch") setAwardTooltip(false); }}
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

      {/* 열렸을 때 포스터 옆으로 와이드되며 뜨는 인기 한줄평 패널. 카드 레이아웃
          자체를 넓히지 않고 살짝 겹치게 띄워서 옆 카드가 밀리지 않게 한다. */}
      {revealed && <TopReviewsPanel movieId={movie.id} shortCount={movie.shortCount} shortAvg={movie.shortAvg} side={popoverSide} myRating={myMovieRating} />}
    </div>
  );
}
