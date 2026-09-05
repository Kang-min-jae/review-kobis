"use client";

import { useState } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import RatingSummary from "./RatingSummary";
import HoverRating from "./HoverRating";
import TopLikedReview from "./TopLikedReview";
import TopReviewsPanel from "./TopReviewsPanel";
import type { RowMovie } from "../_lib/movie-rows";

export default function MovieCard({ movie }: { movie: RowMovie }) {
  // 데스크톱은 마우스가 올라와 있는 동안, 모바일(마우스가 없어 hover가 안 됨)은
  // 한 번 탭하면 켜져서 다시 탭할 때까지 유지된다 — 예매/평점 버튼과 인기 한줄평
  // 패널이 전부 이 하나의 상태로 같이 열리고 닫힌다.
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="relative w-40 shrink-0 sm:w-48">
      <div
        className={`relative aspect-2/3 overflow-hidden rounded-lg ${
          movie.posterUrl ? "bg-surface" : `bg-gradient-to-br ${movie.gradient}`
        }`}
        onMouseEnter={() => setRevealed(true)}
        onMouseLeave={() => setRevealed(false)}
        onClick={() => setRevealed((v) => !v)}
      >
        {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
        {movie.badge && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-star">
            {movie.badge}
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
            <Link
              href={`/movies/${movie.id}/rate`}
              className="flex-1 whitespace-nowrap rounded-full border border-star bg-black/50 px-1 py-1.5 text-center text-[10px] font-semibold text-star transition-colors hover:bg-star hover:text-black"
            >
              ★ 평점
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        <RatingSummary movieId={movie.id} />
        <TopLikedReview movieId={movie.id} />
        <p className="line-clamp-2 text-sm font-medium text-text">{movie.title}</p>
      </div>

      {/* 열렸을 때 포스터 옆으로 와이드되며 뜨는 인기 한줄평 패널. 카드 레이아웃
          자체를 넓히지 않고 살짝 겹치게 띄워서 옆 카드가 밀리지 않게 한다. */}
      {revealed && <TopReviewsPanel movieId={movie.id} />}
    </div>
  );
}
