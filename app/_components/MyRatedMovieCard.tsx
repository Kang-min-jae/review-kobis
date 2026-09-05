"use client";

import { useState } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import StarRating from "./StarRating";
import MyReviewsPanel from "./MyReviewsPanel";
import type { MyMovieRating } from "../_lib/reviews-store";

// 마우스를 올리면(데스크톱) 내가 그 영화에 남긴 리뷰가 옆에 뜬다. 탭/클릭은
// 예매·평점 버튼 같은 경쟁 요소가 안에 없어서 그냥 바로 평가 페이지로 이동해도 된다 —
// MovieCard처럼 탭을 한 번 더 가로챌 필요가 없다.
export default function MyRatedMovieCard({ movie }: { movie: MyMovieRating }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div
      className="relative w-32 shrink-0"
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
    >
      <Link
        href={`/movies/${movie.id}/rate`}
        className={`relative block aspect-2/3 overflow-hidden rounded-lg ${
          movie.posterUrl ? "bg-surface" : `bg-gradient-to-br ${movie.gradient}`
        }`}
      >
        {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
      </Link>
      <p className="mt-2 line-clamp-2 text-xs font-medium text-text">{movie.title}</p>
      <div className="mt-1">
        <StarRating rating={movie.rating} scale={10} size="h-3 w-3" />
      </div>

      {revealed && <MyReviewsPanel movieId={movie.id} />}
    </div>
  );
}
