"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import RatingSummary from "./RatingSummary";
import HoverRating from "./HoverRating";
import TopLikedReview from "./TopLikedReview";
import TopReviewsPanel from "./TopReviewsPanel";
import type { RowMovie } from "../_lib/movie-rows";
import {
  subscribe as subscribeSeedGenres,
  getSeedGenresSnapshot,
  getServerSeedGenresSnapshot,
  ensureSeedGenresLoaded,
} from "../_lib/seed-genres-store";
import {
  subscribe as subscribeAffinity,
  getAffinitySnapshot,
  getServerAffinitySnapshot,
  registerMovieIds,
} from "../_lib/affinity-store";
import {
  subscribe as subscribeReviews,
  getMyReviewsSnapshot,
  getServerMyReviewsSnapshot,
  getCombinedRatingSnapshot,
} from "../_lib/reviews-store";

const FESTIVAL_KO: Record<string, string> = {
  academy: "아카데미상",
  cannes: "칸 영화제",
  berlin: "베를린 영화제",
  venice: "베니스 영화제",
};

export default function MovieCard({ movie }: { movie: RowMovie }) {
  // 데스크톱은 마우스가 올라와 있는 동안, 모바일(마우스가 없어 hover가 안 됨)은
  // 한 번 탭하면 켜져서 다시 탭할 때까지 유지된다 — 예매/평점 버튼과 인기 한줄평
  // 패널이 전부 이 하나의 상태로 같이 열리고 닫힌다.
  const [revealed, setRevealed] = useState(false);
  const [awardTooltip, setAwardTooltip] = useState(false);
  // 필모그래피에는 KOBIS에 등록이 없는(평점 페이지로 연결할 movieCd가 없는) 작품도
  // 이제 포함된다(person-filmography.ts 참고) — 그런 카드는 id가 "kobis-"가 아니라
  // "kmdb-"로 시작한다. 평점 등록만 못 하게 막고, 카드 자체는 그대로 보여준다.
  const isSeries = movie.id.startsWith("tmdb-tv-");
  const isTmdbMovie = movie.id.startsWith("tmdb-") && !isSeries;
  const isRatable = movie.id.startsWith("kobis-") || isSeries || isTmdbMovie;
  const rateHref = isSeries ? `/series/${movie.id}/rate` : `/movies/${movie.id}/rate`;

  // "추천 N%"는 내가 남긴 평점의 장르와 이 영화의 장르가 겹치는 비율 — 평점은
  // 브라우저에만 있어서 서버가 계산해줄 수 없으니 여기서 직접 계산한다.
  const seedGenres = useSyncExternalStore(subscribeSeedGenres, getSeedGenresSnapshot, getServerSeedGenresSnapshot);
  const affinityScores = useSyncExternalStore(subscribeAffinity, getAffinitySnapshot, getServerAffinitySnapshot);
  const myReviews = useSyncExternalStore(subscribeReviews, getMyReviewsSnapshot, getServerMyReviewsSnapshot);
  useEffect(() => {
    ensureSeedGenresLoaded();
    registerMovieIds([movie.id]);
  }, [movie.id]);

  // 내가 이 영화에 남긴 "전체" 한줄평 평점 (있으면)
  const myMovieRating = useMemo(() => {
    const mine = myReviews.find(
      (r) => r.movieId === movie.id && r.type === "short" && (r.category ?? "전체") === "전체"
    );
    return mine ? mine.rating : null;
  }, [myReviews, movie.id]);

  // 우선순위: 서버 추천 점수 → affinity store → Simpson 장르 근사 + 작품 평점 가중합
  // 수식: 0.6 × Simpson유사도 + 0.4 × (평점/10)
  // Simpson 계수: overlapCount / min(|userGenres|, |movieGenres|)
  //   → 분모를 둘 중 작은 집합으로 삼아 "단일 장르 드라마" 20% 동결 방지
  // 시리즈는 장르 데이터가 있으면 같은 수식을 적용하고, 평점 기반 차별화가 작동한다.
  const matchBadge = useMemo(() => {
    if (movie.recommendScore != null && movie.recommendScore > 0) return `추천 ${movie.recommendScore}%`;
    const affinityScore = affinityScores[movie.id];
    if (affinityScore != null && affinityScore > 0) return `추천 ${affinityScore}%`;
    if (seedGenres.length === 0 || !movie.allGenres || movie.allGenres.length === 0) return null;
    const seedSet = new Set(seedGenres);
    const overlapCount = movie.allGenres.filter((g) => seedSet.has(g)).length;
    if (overlapCount === 0) return null;
    // Simpson 오버랩 계수 — 분모를 두 집합 중 작은 쪽으로
    const minLen = Math.min(seedGenres.length, movie.allGenres.length);
    const genreSimilarity = overlapCount / minLen;
    // 작품 평점 보정 (플랫폼 평점 우선, 없으면 중립 0.65)
    const combined = getCombinedRatingSnapshot(movie.id);
    const qualityScore = combined.count >= 1 && combined.average !== null
      ? combined.average / 10
      : 0.65;
    const percent = Math.round((0.6 * genreSimilarity + 0.4 * qualityScore) * 100);
    if (percent <= 0) return null;
    return `추천 ${Math.min(99, Math.max(1, percent))}%`;
  }, [seedGenres, affinityScores, movie.allGenres, movie.recommendScore, movie.id]);

  return (
    <div
      className={`relative w-40 shrink-0 rounded-xl border border-white/15 bg-white/5 p-2 shadow-lg backdrop-blur-sm sm:w-48 ${
        revealed ? "z-10" : "z-0"
      }`}
    >
      <div
        className={`relative aspect-2/3 overflow-hidden rounded-lg ${
          movie.posterUrl ? "bg-black" : `bg-gradient-to-br ${movie.gradient}`
        }`}
        onMouseEnter={() => setRevealed(true)}
        onMouseLeave={() => setRevealed(false)}
        onClick={() => setRevealed((v) => !v)}
      >
        {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
        {/* 왼쪽: 추천 % */}
        {matchBadge && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-brand/25 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-inset ring-brand/50">
            {matchBadge}
          </span>
        )}
        {/* 우측 상단: 트로피 (수상작) + 순위·재개봉일 배지 세로 스택 */}
        {(movie.awardBadge || movie.badge) && (
          <div className="absolute right-1.5 top-1.5 flex flex-col items-end gap-1">
            {movie.awardBadge && (
              <button
                type="button"
                aria-label={movie.festivalAwards?.map((a) => `${FESTIVAL_KO[a.festival] ?? a.festival} ${a.categoryLabel} (${a.year})`).join(", ") ?? "영화제 수상작"}
                className="relative cursor-pointer"
                onMouseEnter={() => setAwardTooltip(true)}
                onMouseLeave={() => setAwardTooltip(false)}
                onClick={(e) => { e.stopPropagation(); setAwardTooltip((v) => !v); }}
              >
                <span className="rounded-full bg-yellow-500/30 px-1.5 py-0.5 text-[11px] leading-none ring-1 ring-inset ring-yellow-400/50">
                  🏆
                </span>
                {movie.festivalAwards && movie.festivalAwards.length > 1 && (
                  <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-yellow-400 px-1 text-[8px] font-bold leading-tight text-black">
                    +{movie.festivalAwards.length - 1}
                  </span>
                )}
              </button>
            )}
            {movie.badge && (
              <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-inset ring-white/20">
                {movie.badge}
              </span>
            )}
          </div>
        )}
        <HoverRating movieId={movie.id} />

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
              <Link
                href={`/theaters?movie=${movie.id}`}
                className="flex-1 whitespace-nowrap rounded-full border border-brand bg-black/50 px-1 py-1.5 text-center text-[10px] font-semibold text-brand transition-colors hover:bg-brand hover:text-white"
              >
                🎫 예매
              </Link>
            )}
            {isRatable ? (
              <Link
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
        <RatingSummary movieId={movie.id} />
        <TopLikedReview movieId={movie.id} />
      </div>

      {/* 수상 내역 툴팁 — overflow-hidden 포스터 div 밖에 렌더해 클리핑 없이 보인다 */}
      {awardTooltip && movie.festivalAwards && movie.festivalAwards.length > 0 && (
        <div
          className="absolute right-0 top-1 z-50 max-w-[200px] rounded-lg bg-black/90 p-2 text-[11px] text-white ring-1 ring-white/10"
          onMouseEnter={() => setAwardTooltip(true)}
          onMouseLeave={() => setAwardTooltip(false)}
        >
          {movie.festivalAwards.map((a, i) => (
            <div key={i} className="py-0.5 leading-snug">
              <span className="font-semibold">{FESTIVAL_KO[a.festival] ?? a.festival}</span>{" "}
              <span className="text-yellow-300">{a.categoryLabel}</span>{" "}
              <span className="text-white/60">({a.year})</span>
            </div>
          ))}
        </div>
      )}

      {/* 열렸을 때 포스터 옆으로 와이드되며 뜨는 인기 한줄평 패널. 카드 레이아웃
          자체를 넓히지 않고 살짝 겹치게 띄워서 옆 카드가 밀리지 않게 한다. */}
      {revealed && <TopReviewsPanel movieId={movie.id} />}
    </div>
  );
}
