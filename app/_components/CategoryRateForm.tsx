"use client";

import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import StarRating from "./StarRating";
import SpoilerText from "./SpoilerText";
import {
  subscribe,
  getVersion,
  getCategoryAverage,
  getMyCategoryRating,
  submitCategoryRating,
  type RatingCategory,
} from "../_lib/category-ratings-store";
import { countSentences } from "../_lib/text";
import {
  addReview,
  subscribe as subscribeReviews,
  getReviewsSnapshot,
  getSeedReviewsSnapshot,
} from "../_lib/reviews-store";
import {
  subscribe as subscribeVotes,
  getVotesSnapshot,
  getServerVotesSnapshot,
  getReviewVote,
  toggleVote,
} from "../_lib/review-votes-store";
import type { ReviewType } from "../_lib/mock-reviews";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const tabs: { type: ReviewType; label: string }[] = [
  { type: "short", label: "한줄평" },
  { type: "long", label: "장문평" },
];

const SHORT_MAX_SENTENCES = 2;

function VoteButtons({ reviewId }: { reviewId: string }) {
  const votesState = useSyncExternalStore(subscribeVotes, getVotesSnapshot, getServerVotesSnapshot);
  const { likes, dislikes, myVote } = getReviewVote(votesState, reviewId);
  const total = likes + dislikes;
  const likePct = total > 0 ? Math.round((likes / total) * 100) : null;
  const dislikePct = total > 0 ? 100 - likePct! : null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => toggleVote(reviewId, "like")}
        className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition-colors ${
          myVote === "like" ? "bg-brand text-white" : "bg-black/30 text-muted hover:text-text"
        }`}
      >
        👍 {likes}
        {likePct !== null && <span className="opacity-80">({likePct}%)</span>}
      </button>
      <button
        type="button"
        onClick={() => toggleVote(reviewId, "dislike")}
        className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition-colors ${
          myVote === "dislike" ? "bg-neutral-600 text-white" : "bg-black/30 text-muted hover:text-text"
        }`}
      >
        👎 {dislikes}
        {dislikePct !== null && <span className="opacity-80">({dislikePct}%)</span>}
      </button>
    </div>
  );
}

// 항목별(전체/연출/연기/각본/음악/편집) 평점 입력 + 그 항목에 대한 한줄평/장문평
// 작성·목록을 함께 담당한다. 영화 정보(포스터/제목 등)는 호출하는 페이지가
// MovieInfoHeader로 위에 따로 보여준다.
export default function CategoryRateForm({
  movieId,
  movieCd,
  movieTitle,
  posterUrl,
  gradient,
  category,
}: {
  movieId: string;
  movieCd: string | null;
  movieTitle: string;
  posterUrl: string | null;
  gradient: string;
  category: RatingCategory;
}) {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const { average, count } = useMemo(
    () => getCategoryAverage(movieId, category),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movieId, category, version]
  );
  const myRating = useMemo(
    () => getMyCategoryRating(movieId, category),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movieId, category, version]
  );

  const [value, setValue] = useState(myRating ?? 8);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmitCategoryRating() {
    submitCategoryRating(movieId, category, value);
    setSubmitted(true);
  }

  const [activeTab, setActiveTab] = useState<ReviewType>("short");
  const [shortRating, setShortRating] = useState(8);
  const [longRating, setLongRating] = useState(80);
  const [content, setContent] = useState("");

  const reviews = useSyncExternalStore(
    subscribeReviews,
    () => getReviewsSnapshot(movieId, activeTab, category),
    () => getSeedReviewsSnapshot(movieId, activeTab, category)
  );

  const reviewRating = activeTab === "short" ? shortRating : longRating;
  const scale = activeTab === "short" ? 10 : 100;
  const sentenceCount = activeTab === "short" ? countSentences(content) : 0;
  const tooManySentences = activeTab === "short" && sentenceCount > SHORT_MAX_SENTENCES;
  const canSubmitReview = content.trim().length > 0 && !tooManySentences;

  function handleTabChange(type: ReviewType) {
    setActiveTab(type);
    setContent("");
  }

  function handleSubmitReview(e: FormEvent) {
    e.preventDefault();
    if (!canSubmitReview) return;

    addReview({
      movieId,
      movieCd,
      movieTitle,
      moviePosterUrl: posterUrl,
      movieGradient: gradient,
      type: activeTab,
      category,
      rating: reviewRating,
      content: content.trim(),
    });
    setContent("");
  }

  return (
    <div>
      <div className="rounded-lg border border-neutral-700 bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-text">{category} 평점 남기기</h2>
          <span className="text-sm text-muted">
            평균 <span className="font-bold text-star">{average !== null ? average.toFixed(1) : "-"}</span>
            {count > 0 && ` (${count}명)`}
          </span>
        </div>

        <div className="mt-4">
          <StarRating rating={value} scale={10} size="h-6 w-6" />
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={value}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (!Number.isNaN(next)) {
                  setValue(Math.round(clamp(next, 0, 10) * 10) / 10);
                  setSubmitted(false);
                }
              }}
              className="w-24 rounded-lg border border-neutral-700 bg-bg px-3 py-2 text-sm text-text focus:border-brand focus:outline-none"
            />
            <span className="text-xs text-muted">/ 10.0 (소수점 첫째 자리까지)</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmitCategoryRating}
          className="mt-6 w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          {myRating !== null ? "평점 수정하기" : "평점 등록하기"}
        </button>

        {(submitted || myRating !== null) && (
          <p className="mt-2 text-center text-xs text-muted">
            내가 남긴 {category} 평점: {(submitted ? value : myRating!).toFixed(1)}
          </p>
        )}
      </div>

      <div className="mt-6 flex gap-2">
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

      <form onSubmit={handleSubmitReview} className="mt-6 space-y-4">
        <div>
          <div className="flex items-center gap-3">
            <StarRating rating={reviewRating} scale={scale} size="h-5 w-5" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={scale}
              step={0.1}
              value={activeTab === "short" ? shortRating : longRating}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isNaN(next)) return;
                const rounded = Math.round(clamp(next, 0, scale) * 10) / 10;
                if (activeTab === "short") setShortRating(rounded);
                else setLongRating(rounded);
              }}
              className="w-24 rounded-lg border border-neutral-700 bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none"
            />
            <span className="text-xs text-muted">/ {scale.toFixed(1)} (소수점 첫째 자리까지)</span>
          </div>
        </div>

        {activeTab === "short" ? (
          <div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              maxLength={200}
              placeholder={`${category}에 대해 한 줄로 남겨보세요 (최대 2문장)`}
              className="w-full rounded-lg border border-neutral-700 bg-surface px-4 py-3 text-text placeholder:text-muted focus:border-brand focus:outline-none"
            />
            <p className={`mt-1 text-xs ${tooManySentences ? "text-brand" : "text-muted"}`}>
              {sentenceCount}/{SHORT_MAX_SENTENCES}문장
              {tooManySentences && " · 한줄평은 2문장까지만 가능해요"}
            </p>
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            placeholder={`${category}에 대한 자세한 감상평을 남겨주세요`}
            className="w-full rounded-lg border border-neutral-700 bg-surface px-4 py-3 text-text placeholder:text-muted focus:border-brand focus:outline-none"
          />
        )}

        <button
          type="submit"
          disabled={!canSubmitReview}
          className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          등록하기
        </button>
      </form>

      <div className="mt-8">
        <h2 className="text-sm font-bold text-text">
          {category} {tabs.find((t) => t.type === activeTab)?.label} ({reviews.length})
        </h2>
        <ul className="mt-3 space-y-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-lg bg-surface p-3">
              <div className="flex items-center justify-between">
                <Link
                  href={`/users/${review.authorId}`}
                  className="text-xs font-semibold text-text hover:underline"
                >
                  {review.authorName}
                </Link>
                <StarRating rating={review.rating} scale={scale} size="h-3 w-3" />
              </div>
              <div className="mt-1.5">
                <SpoilerText content={review.content} className="whitespace-pre-wrap text-sm text-text" />
              </div>
              <div className="mt-2 flex justify-end">
                <VoteButtons reviewId={review.id} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
