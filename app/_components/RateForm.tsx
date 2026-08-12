"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StarRating from "./StarRating";
import {
  addReview,
  subscribe,
  getReviewsSnapshot,
  getSeedReviewsSnapshot,
} from "../_lib/reviews-store";
import type { ReviewType } from "../_lib/mock-reviews";

const tabs: { type: ReviewType; label: string }[] = [
  { type: "short", label: "한줄평" },
  { type: "long", label: "장문평" },
];

export default function RateForm({
  movieId,
  movieTitle,
}: {
  movieId: string;
  movieTitle: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ReviewType>("short");
  const [rating, setRating] = useState(8);
  const [content, setContent] = useState("");

  const reviews = useSyncExternalStore(
    subscribe,
    () => getReviewsSnapshot(movieId, activeTab),
    () => getSeedReviewsSnapshot(movieId, activeTab)
  );

  function handleTabChange(type: ReviewType) {
    setActiveTab(type);
    setContent("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    addReview({ movieId, type: activeTab, rating, content: content.trim() });
    router.push("/");
  }

  return (
    <div>
      <Link href="/" className="text-sm text-muted hover:text-text">
        ← 뒤로
      </Link>
      <h1 className="mt-3 text-lg font-bold text-text">{movieTitle} 평가하기</h1>

      <div className="mt-4 flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.type}
            type="button"
            onClick={() => handleTabChange(tab.type)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              activeTab === tab.type
                ? "bg-brand text-white"
                : "bg-surface text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <div className="flex items-center gap-3">
            <StarRating rating={rating} size="h-5 w-5" />
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="mt-2 w-full accent-brand"
          />
        </div>

        {activeTab === "short" ? (
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={80}
            placeholder="한 줄로 남겨보세요"
            className="w-full rounded-lg border border-neutral-700 bg-surface px-4 py-3 text-text placeholder:text-muted focus:border-brand focus:outline-none"
          />
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            placeholder="자세한 감상평을 남겨주세요"
            className="w-full rounded-lg border border-neutral-700 bg-surface px-4 py-3 text-text placeholder:text-muted focus:border-brand focus:outline-none"
          />
        )}

        <button
          type="submit"
          className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          등록하기
        </button>
      </form>

      <div className="mt-8">
        <h2 className="text-sm font-bold text-text">
          {tabs.find((t) => t.type === activeTab)?.label} ({reviews.length})
        </h2>
        <ul className="mt-3 space-y-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-lg bg-surface p-3">
              <StarRating rating={review.rating} size="h-3 w-3" />
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-text">{review.content}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
