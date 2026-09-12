"use client";

import { useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import StarRating from "./StarRating";
import SpoilerText from "./SpoilerText";
import { countSentences } from "../_lib/text";
import { submitReviewAction } from "../_lib/review-actions";
import { toggleReviewVote, type VoteType } from "../_lib/social-actions";
import type { RatingCategory } from "../_lib/category-ratings-store";
import type { ReviewWithAuthor, MyReview } from "../_lib/review-data";
import { upsertMyReview } from "../_lib/reviews-store";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// 리뷰 하나에 대한 좋아요/싫어요 버튼. 낙관적으로 먼저 화면을 바꾸고, 서버 액션이
// 실패하면 원래대로 되돌린다 — 매 클릭마다 router.refresh()로 페이지 전체를 다시
// 그리진 않아 반응이 즉각적이다(카운트는 이 컴포넌트 안에서만 갱신되고, 다음 페이지
// 이동/새로고침 때 서버 값과 다시 맞춰진다).
function ReviewVoteButtons({
  reviewId,
  isLoggedIn,
  onSignInRequired,
  initialLikeCount,
  initialDislikeCount,
  initialMyVote,
}: {
  reviewId: string;
  isLoggedIn: boolean;
  onSignInRequired: () => void;
  initialLikeCount: number;
  initialDislikeCount: number;
  initialMyVote: VoteType | null;
}) {
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [dislikeCount, setDislikeCount] = useState(initialDislikeCount);
  const [myVote, setMyVote] = useState(initialMyVote);
  const [pending, setPending] = useState(false);

  async function handleVote(type: VoteType) {
    if (!isLoggedIn) {
      onSignInRequired();
      return;
    }
    if (pending) return;

    const prevVote = myVote;
    const prevLike = likeCount;
    const prevDislike = dislikeCount;
    const nextVote = prevVote === type ? null : type;

    setMyVote(nextVote);
    setLikeCount(prevLike + (nextVote === "LIKE" ? 1 : 0) - (prevVote === "LIKE" ? 1 : 0));
    setDislikeCount(prevDislike + (nextVote === "DISLIKE" ? 1 : 0) - (prevVote === "DISLIKE" ? 1 : 0));
    setPending(true);
    try {
      await toggleReviewVote(reviewId, type);
    } catch {
      setMyVote(prevVote);
      setLikeCount(prevLike);
      setDislikeCount(prevDislike);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => handleVote("LIKE")}
        className={`flex items-center gap-1 text-xs font-semibold transition-colors ${
          myVote === "LIKE" ? "text-brand" : "text-muted hover:text-text"
        }`}
      >
        👍 {likeCount}
      </button>
      <button
        type="button"
        onClick={() => handleVote("DISLIKE")}
        className={`flex items-center gap-1 text-xs font-semibold transition-colors ${
          myVote === "DISLIKE" ? "text-brand" : "text-muted hover:text-text"
        }`}
      >
        👎 {dislikeCount}
      </button>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

type ReviewTab = "SHORT" | "LONG";

const tabs: { type: ReviewTab; label: string }[] = [
  { type: "SHORT", label: "한줄평" },
  { type: "LONG", label: "장문평" },
];

const SHORT_MAX_SENTENCES = 2;

// 항목별(전체/연출/연기/각본/음악/편집) 평점 입력 + 그 항목에 대한 한줄평/장문평
// 작성·목록을 함께 담당한다. 데이터는 전부 페이지(서버 컴포넌트)가 DB에서 미리
// 조회해 props로 내려주고, 등록/수정은 서버 액션을 호출한 뒤 router.refresh()로
// 최신 데이터를 다시 받아온다. 로그인 안 한 사람은 등록을 시도하면 로그인
// 페이지로 보낸다.
export default function CategoryRateForm({
  movieId,
  movieCd,
  movieTitle,
  moviePosterUrl,
  movieGradient,
  category,
  isLoggedIn,
  reviews,
  myReviews,
}: {
  movieId: string;
  movieCd: string;
  movieTitle: string;
  moviePosterUrl: string | null;
  movieGradient: string;
  category: RatingCategory;
  isLoggedIn: boolean;
  reviews: { SHORT: ReviewWithAuthor[]; LONG: ReviewWithAuthor[] };
  myReviews: { SHORT: MyReview; LONG: MyReview };
}) {
  const router = useRouter();
  const pathname = usePathname();

  function goToSignIn() {
    router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
  }

  const [activeTab, setActiveTab] = useState<ReviewTab>("SHORT");
  const [shortRating, setShortRating] = useState(myReviews.SHORT?.rating ?? 8);
  const [longRating, setLongRating] = useState(myReviews.LONG?.rating ?? 80);
  const [shortContent, setShortContent] = useState(myReviews.SHORT?.content ?? "");
  const [longContent, setLongContent] = useState(myReviews.LONG?.content ?? "");
  const [submittingReview, setSubmittingReview] = useState(false);

  const content = activeTab === "SHORT" ? shortContent : longContent;
  const setContent = activeTab === "SHORT" ? setShortContent : setLongContent;
  const reviewRating = activeTab === "SHORT" ? shortRating : longRating;
  const scale = activeTab === "SHORT" ? 10 : 100;
  const sentenceCount = activeTab === "SHORT" ? countSentences(content) : 0;
  const tooManySentences = activeTab === "SHORT" && sentenceCount > SHORT_MAX_SENTENCES;
  const canSubmitReview = !tooManySentences;
  const myReview = myReviews[activeTab];
  // SHORT: 평점만 남긴 것도 포함해서 모두 표시, LONG: 텍스트 있는 것만 표시
  const displayReviews = activeTab === "SHORT"
    ? reviews[activeTab]
    : reviews[activeTab].filter((r) => r.content.trim().length > 0);

  async function handleSubmitReview(e: FormEvent) {
    e.preventDefault();
    if (!isLoggedIn) {
      goToSignIn();
      return;
    }
    if (!canSubmitReview) return;

    setSubmittingReview(true);
    try {
      await submitReviewAction({
        movieId,
        movieCd,
        category,
        type: activeTab,
        rating: reviewRating,
        content: content.trim(),
      });
      upsertMyReview({
        movieId,
        movieCd,
        movieTitle,
        moviePosterUrl,
        movieGradient,
        category,
        type: activeTab === "SHORT" ? "short" : "long",
        rating: reviewRating,
        content: content.trim(),
      });
      router.refresh();
    } finally {
      setSubmittingReview(false);
    }
  }

  return (
    <div>
      {!isLoggedIn && (
        <p className="mb-4 rounded-lg border border-brand/40 bg-brand/10 p-3 text-xs text-brand">
          로그인하면 평점과 리뷰를 남길 수 있어요.{" "}
          <button type="button" onClick={goToSignIn} className="font-semibold underline">
            로그인하기
          </button>
        </p>
      )}

      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.type}
            type="button"
            onClick={() => setActiveTab(tab.type)}
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

      {myReview && (
        <div className="mt-4 rounded-lg border border-neutral-700 bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-star">내 평점</span>
              <StarRating rating={myReview.rating} scale={scale} size="h-5 w-5" />
              <span className="text-xs font-normal text-muted">/{scale.toFixed(1)}</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">
                {myReview.content.trim()
                  ? myReview.content.trim().slice(0, 24) + (myReview.content.trim().length > 24 ? "…" : "")
                  : `${activeTab === "SHORT" ? "한줄평" : "장문평"} 없음`}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {formatDate(myReview.createdAt)} 등록 · 수정
              </p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmitReview} className="mt-4 space-y-4">
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
              value={activeTab === "SHORT" ? shortRating : longRating}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isNaN(next)) return;
                const rounded = Math.round(clamp(next, 0, scale) * 10) / 10;
                if (activeTab === "SHORT") setShortRating(rounded);
                else setLongRating(rounded);
              }}
              className="w-24 rounded-lg border border-neutral-700 bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none"
            />
            <span className="text-xs text-muted">/ {scale.toFixed(1)} (소수점 첫째 자리까지)</span>
          </div>
        </div>

        {activeTab === "SHORT" ? (
          <div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              maxLength={200}
              placeholder={`${category}에 대해 한 줄로 남겨보세요 (최대 2문장)`}
              className="w-full rounded-lg border border-neutral-700 bg-surface px-4 py-3 text-text placeholder:text-muted focus:border-brand focus:outline-none"
            />
            <div className="mt-1 flex items-center justify-between">
              <p className={`text-xs ${tooManySentences ? "text-brand" : "text-muted"}`}>
                {sentenceCount}/{SHORT_MAX_SENTENCES}문장
                {tooManySentences && " · 한줄평은 2문장까지만 가능해요"}
              </p>
              <p className="text-[11px] text-muted">글 없이 평점만 남겨도 등록할 수 있어요</p>
            </div>
          </div>
        ) : (
          <div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder={`${category}에 대한 자세한 감상평을 남겨주세요`}
              className="w-full rounded-lg border border-neutral-700 bg-surface px-4 py-3 text-text placeholder:text-muted focus:border-brand focus:outline-none"
            />
            <p className="mt-1 text-right text-[11px] text-muted">글 없이 평점만 남겨도 등록할 수 있어요</p>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmitReview || submittingReview}
          className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {myReview ? "수정하기" : "등록하기"}
        </button>
      </form>

      <div className="mt-8">
        <h2 className="text-sm font-bold text-text">
          전체 {tabs.find((t) => t.type === activeTab)?.label} ({displayReviews.length})
        </h2>
        <ul className="mt-3 space-y-4">
          {displayReviews.map((review) => (
            <li key={review.id} className="flex gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-sm font-bold text-text">
                {review.authorName.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-text">{review.authorName}</span>
                  <StarRating rating={review.rating} scale={scale} size="h-3 w-3" />
                  {!review.content.trim() && (
                    <span className="rounded border border-neutral-600 px-1.5 py-0.5 text-[10px] text-muted">
                      평점만 남김
                    </span>
                  )}
                </div>
                {review.content.trim() && (
                  <div className="mt-1">
                    <SpoilerText content={review.content} className="whitespace-pre-wrap text-sm text-text" />
                  </div>
                )}
                <div className="mt-2">
                  <ReviewVoteButtons
                    reviewId={review.id}
                    isLoggedIn={isLoggedIn}
                    onSignInRequired={goToSignIn}
                    initialLikeCount={review.likeCount}
                    initialDislikeCount={review.dislikeCount}
                    initialMyVote={review.myVote}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
