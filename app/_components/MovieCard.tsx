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

export default function MovieCard({ movie }: { movie: RowMovie }) {
  // 데스크톱은 마우스가 올라와 있는 동안, 모바일(마우스가 없어 hover가 안 됨)은
  // 한 번 탭하면 켜져서 다시 탭할 때까지 유지된다 — 예매/평점 버튼과 인기 한줄평
  // 패널이 전부 이 하나의 상태로 같이 열리고 닫힌다.
  const [revealed, setRevealed] = useState(false);
  // 필모그래피에는 KOBIS에 등록이 없는(평점 페이지로 연결할 movieCd가 없는) 작품도
  // 이제 포함된다(person-filmography.ts 참고) — 그런 카드는 id가 "kobis-"가 아니라
  // "kmdb-"로 시작한다. 평점 등록만 못 하게 막고, 카드 자체는 그대로 보여준다.
  const isSeries = movie.id.startsWith("tmdb-tv-");
  const isRatable = movie.id.startsWith("kobis-") || isSeries;
  const rateHref = isSeries ? `/series/${movie.id}/rate` : `/movies/${movie.id}/rate`;

  // "추천 N%"는 내가 남긴 평점의 장르와 이 영화의 장르가 겹치는 비율 — 평점은
  // 브라우저에만 있어서 서버가 계산해줄 수 없으니 여기서 직접 계산한다.
  const seedGenres = useSyncExternalStore(subscribeSeedGenres, getSeedGenresSnapshot, getServerSeedGenresSnapshot);
  useEffect(() => {
    ensureSeedGenresLoaded();
  }, []);

  const matchBadge = useMemo(() => {
    if (seedGenres.length === 0 || !movie.allGenres || movie.allGenres.length === 0) return null;
    const seedSet = new Set(seedGenres);
    const overlapCount = movie.allGenres.filter((g) => seedSet.has(g)).length;
    if (overlapCount === 0) return null;
    const percent = Math.round((overlapCount / movie.allGenres.length) * 100);
    return `추천 ${percent}%`;
  }, [seedGenres, movie.allGenres]);

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
        {movie.badge && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-brand/25 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-inset ring-brand/50">
            {movie.badge}
          </span>
        )}
        {matchBadge && (
          // 순위·재개봉일 같은 다른 배지가 이미 왼쪽 위를 쓰고 있으면 겹치지 않게
          // 오른쪽 위로, 없으면(대부분의 행) 기준 화면대로 왼쪽 위에 보여준다.
          <span
            className={`absolute top-1.5 rounded-full bg-brand/25 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-inset ring-brand/50 ${
              movie.badge ? "right-1.5" : "left-1.5"
            }`}
          >
            {matchBadge}
          </span>
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
                className="flex-1 whitespace-nowrap rounded-full border border-star bg-black/50 px-1 py-1.5 text-center text-[10px] font-semibold text-star transition-colors hover:bg-star hover:text-black"
              >
                ★ 평점
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
        {movie.genre && <p className="text-xs text-sky-400">{movie.genre}</p>}
        <RatingSummary movieId={movie.id} />
        <TopLikedReview movieId={movie.id} />
      </div>

      {/* 열렸을 때 포스터 옆으로 와이드되며 뜨는 인기 한줄평 패널. 카드 레이아웃
          자체를 넓히지 않고 살짝 겹치게 띄워서 옆 카드가 밀리지 않게 한다. */}
      {revealed && <TopReviewsPanel movieId={movie.id} />}
    </div>
  );
}
