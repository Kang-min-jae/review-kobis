"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StarRating from "./StarRating";
import PosterImage from "./PosterImage";
import { countSentences } from "../_lib/text";
import {
  addReview,
  subscribe,
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
import type { KobisPersonRef, KobisCastMember, KoficBoxOffice } from "../_lib/kobis";

const tabs: { type: ReviewType; label: string }[] = [
  { type: "short", label: "한줄평" },
  { type: "long", label: "장문평" },
];

const SHORT_MAX_SENTENCES = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatCount(n: number): string {
  return `${n.toLocaleString("ko-KR")}명`;
}

function formatWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

function VoteButtons({ reviewId }: { reviewId: string }) {
  const votesState = useSyncExternalStore(subscribeVotes, getVotesSnapshot, getServerVotesSnapshot);
  const { likes, dislikes, myVote } = getReviewVote(votesState, reviewId);

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
      </button>
      <button
        type="button"
        onClick={() => toggleVote(reviewId, "dislike")}
        className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition-colors ${
          myVote === "dislike" ? "bg-neutral-600 text-white" : "bg-black/30 text-muted hover:text-text"
        }`}
      >
        👎 {dislikes}
      </button>
    </div>
  );
}

export default function RateForm({
  movieId,
  movieCd,
  movieTitle,
  description,
  posterUrl,
  gradient,
  releaseDate,
  rereleaseDate,
  director,
  cast,
  boxOffice,
}: {
  movieId: string;
  movieCd: string | null;
  movieTitle: string;
  description: string;
  posterUrl: string | null;
  gradient: string;
  releaseDate: string | null;
  rereleaseDate: string | null;
  director: KobisPersonRef | null;
  cast: KobisCastMember[];
  boxOffice: KoficBoxOffice | null;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ReviewType>("short");
  const [shortRating, setShortRating] = useState(8);
  const [longRating, setLongRating] = useState(80);
  const [content, setContent] = useState("");

  const reviews = useSyncExternalStore(
    subscribe,
    () => getReviewsSnapshot(movieId, activeTab),
    () => getSeedReviewsSnapshot(movieId, activeTab)
  );

  const rating = activeTab === "short" ? shortRating : longRating;
  const scale = activeTab === "short" ? 10 : 100;
  const sentenceCount = activeTab === "short" ? countSentences(content) : 0;
  const tooManySentences = activeTab === "short" && sentenceCount > SHORT_MAX_SENTENCES;
  const canSubmit = content.trim().length > 0 && !tooManySentences;

  function handleTabChange(type: ReviewType) {
    setActiveTab(type);
    setContent("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    addReview({
      movieId,
      movieCd,
      movieTitle,
      moviePosterUrl: posterUrl,
      movieGradient: gradient,
      type: activeTab,
      rating,
      content: content.trim(),
    });
    router.push("/");
  }

  return (
    <div>
      <Link href="/" className="text-sm text-muted hover:text-text">
        ← 뒤로
      </Link>

      <div className="mt-3 flex gap-4">
        <div
          className={`relative aspect-2/3 w-24 shrink-0 overflow-hidden rounded-lg sm:w-28 ${
            posterUrl ? "bg-surface" : `bg-gradient-to-br ${gradient}`
          }`}
        >
          {posterUrl && <PosterImage src={posterUrl} alt={`${movieTitle} 포스터`} />}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-text">
            {movieTitle}
            {(releaseDate || rereleaseDate) && (
              <span className="ml-2 text-sm font-normal text-muted">
                {releaseDate && `| 개봉연도 ${releaseDate}`}
                {rereleaseDate && ` (재개봉 ${rereleaseDate})`}
                {boxOffice && ` · 누적 관객수 ${formatCount(boxOffice.audiAcc)}`}
                {boxOffice && ` · 누적 흥행 수익 ${formatWon(boxOffice.salesAcc)}`}
              </span>
            )}
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-muted">{description}</p>

          {(director || cast.length > 0) && (
            <p className="mt-3 text-xs text-muted">
              {director && (
                <>
                  감독{" "}
                  <Link
                    href={`/people/${encodeURIComponent(director.name)}`}
                    className="text-text hover:underline"
                  >
                    {director.name}
                  </Link>
                </>
              )}
              {director && cast.length > 0 && " | "}
              {cast.length > 0 && (
                <>
                  출연{" "}
                  {cast.map((member, i) => (
                    <span key={member.name}>
                      <Link
                        href={`/people/${encodeURIComponent(member.name)}`}
                        className="text-text hover:underline"
                      >
                        {member.name}
                      </Link>
                      {i < cast.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </>
              )}
            </p>
          )}
        </div>
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

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <div className="flex items-center gap-3">
            <StarRating rating={rating} scale={scale} size="h-5 w-5" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={scale}
              step={0.1}
              value={activeTab === "short" ? shortRating : longRating}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isNaN(value)) return;
                const rounded = Math.round(clamp(value, 0, scale) * 10) / 10;
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
              placeholder="한 줄로 남겨보세요 (최대 2문장)"
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
            placeholder="자세한 감상평을 남겨주세요"
            className="w-full rounded-lg border border-neutral-700 bg-surface px-4 py-3 text-text placeholder:text-muted focus:border-brand focus:outline-none"
          />
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
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
              <div className="flex items-center justify-between">
                <Link
                  href={`/users/${review.authorId}`}
                  className="text-xs font-semibold text-text hover:underline"
                >
                  {review.authorName}
                </Link>
                <StarRating rating={review.rating} scale={scale} size="h-3 w-3" />
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-text">{review.content}</p>
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
