"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import StarRating from "./StarRating";
import BackBar from "./BackBar";
import SpoilerText from "./SpoilerText";
import {
  subscribe,
  getReviewsByAuthorSnapshot,
  getServerReviewsByAuthorSnapshot,
} from "../_lib/reviews-store";

export default function ProfileView({ authorId }: { authorId: string }) {
  const reviews = useSyncExternalStore(
    subscribe,
    () => getReviewsByAuthorSnapshot(authorId),
    () => getServerReviewsByAuthorSnapshot()
  );

  const authorName = reviews[0]?.authorName ?? "사용자";

  return (
    <div className="px-5 py-6">
      <BackBar />

      <h1 className="mt-3 text-lg font-bold text-text">{authorName}님의 평가</h1>
      <p className="mt-1 text-xs text-muted">총 {reviews.length}개</p>

      <div className="mt-6 space-y-3">
        {reviews.length === 0 ? (
          <p className="text-sm text-muted">아직 남긴 평가가 없어요.</p>
        ) : (
          reviews.map((review) => {
            const scale = review.type === "short" ? 10 : 100;
            const category = review.category ?? "전체";

            return (
              <div key={review.id} className="rounded-lg bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/movies/${review.movieId}/rate/category/${encodeURIComponent(category)}`}
                    className="truncate text-sm font-semibold text-text hover:underline"
                  >
                    {review.movieTitle}
                  </Link>
                  <span className="shrink-0 text-[10px] text-muted">
                    {category} · {review.type === "short" ? "한줄평" : "장문평"}
                  </span>
                </div>
                <StarRating rating={review.rating} scale={scale} size="h-3 w-3" />
                <div className="mt-1.5">
                  <SpoilerText content={review.content} className="whitespace-pre-wrap text-sm text-text" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
