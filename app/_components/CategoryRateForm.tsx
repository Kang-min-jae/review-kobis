"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import StarRating from "./StarRating";
import { countSentences } from "../_lib/text";
import { submitReviewAction, deleteReviewAction, adminDeleteReviewAction } from "../_lib/review-actions";
import { toggleReviewVote, type VoteType } from "../_lib/social-actions";
import { setAlwaysShowSpoilersAction } from "../_lib/spoiler-actions";
import { suggestsSpoiler } from "../_lib/spoiler";
import type { RatingCategory } from "../_lib/category-ratings-store";
import type { ReviewWithAuthor, MyReview } from "../_lib/review-data";
import { upsertMyReview, initForUser, removeReview } from "../_lib/reviews-store";
import { TIER_STYLES } from "../_lib/tier";
import type { Tier } from "../_lib/tier";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// 소수점 없는 정수 입력을 자동 변환: SHORT "89"→8.9, LONG "899"→89.9
// 정수값이 maxScale 이하면 그대로 사용한다 (LONG "89"→89)
function smartFormatRating(raw: string, maxScale: number): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === ".") return 0;
  let num: number;
  if (cleaned.includes(".")) {
    num = parseFloat(cleaned);
  } else {
    const integer = parseInt(cleaned, 10);
    num = integer > maxScale ? integer / 10 : integer;
  }
  if (Number.isNaN(num)) return 0;
  return Math.round(clamp(num, 0, maxScale) * 10) / 10;
}

function TierBadge({ tier }: { tier: string }) {
  const style = TIER_STYLES[(tier as Tier)] ?? TIER_STYLES["관객"];
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${style.border} ${style.text}`}>
      {tier}
    </span>
  );
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
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => handleVote("LIKE")}
        className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
          myVote === "LIKE"
            ? "bg-brand text-white"
            : "border border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-600 hover:text-text"
        }`}
      >
        공감 {likeCount}
      </button>
      <button
        type="button"
        onClick={() => handleVote("DISLIKE")}
        className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
          myVote === "DISLIKE"
            ? "bg-neutral-600 text-white"
            : "border border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-600 hover:text-text"
        }`}
      >
        싫어요 {dislikeCount}
      </button>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// 별 5개를 눌러 점수를 고른다(한줄평 별 1개 = 2점, 장문평 별 1개 = 20점). 소수점 점수는 옆 숫자 칸에서 입력한다.
function StarPicker({ rating, scale, onPick }: { rating: number; scale: number; onPick: (value: number) => void }) {
  const filledStars = (rating / scale) * 5;
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="별점 선택">
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, filledStars - i));
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPick(((i + 1) * scale) / 5)}
            aria-label={`별 ${i + 1}개 (${((i + 1) * scale) / 5}점)`}
            className="relative h-7 w-7"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="absolute inset-0 h-7 w-7 text-neutral-700" aria-hidden="true">
              <path d="M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7-5.4-4.7 7.1-.6z" />
            </svg>
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-star">
                <path d="M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7-5.4-4.7 7.1-.6z" />
              </svg>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// 스포일러 키워드가 있는데 체크를 안 했을 때 등록 전에 띄우는 확인 창(브라우저 기본 confirm 대신 사이트 스타일).
function SpoilerConfirmModal({ onMark, onSubmitAsIs, onCancel }: { onMark: () => void; onSubmitAsIs: () => void; onCancel: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="spoiler-confirm-title"
        className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-700 bg-surface p-6 text-center shadow-2xl"
      >
        <h3 id="spoiler-confirm-title" className="text-base font-bold text-text">
          스포일러가 포함된 것 같아요.
          <br />
          스포일러로 표시할까요?
        </h3>
        <p className="mt-2 text-xs text-muted">표시하면 다른 회원에게는 눌러야 보이도록 가려져요.</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onSubmitAsIs}
            className="flex-1 rounded-full border border-neutral-700 py-2.5 text-sm font-semibold text-text transition-colors hover:border-neutral-500"
          >
            그냥 등록
          </button>
          <button
            type="button"
            autoFocus
            onClick={onMark}
            className="flex-1 rounded-full bg-star py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90"
          >
            스포일러로 표시
          </button>
        </div>
      </div>
    </>
  );
}

type ReviewTab = "SHORT" | "LONG";
type SortMode = "likes" | "latest" | "friends";

const SORTS: { mode: SortMode; label: string }[] = [
  { mode: "likes", label: "공감순" },
  { mode: "latest", label: "최신순" },
  { mode: "friends", label: "팔로잉" },
];

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
  userId = null,
  userName,
  isAdmin = false,
  reviews,
  myReviews,
  followingIds = [],
  alwaysShowSpoilers = false,
}: {
  movieId: string;
  movieCd: string;
  movieTitle: string;
  moviePosterUrl: string | null;
  movieGradient: string;
  category: RatingCategory;
  isLoggedIn: boolean;
  userId?: string | null;
  userName?: string | null;
  isAdmin?: boolean;
  reviews: { SHORT: ReviewWithAuthor[]; LONG: ReviewWithAuthor[] };
  myReviews: { SHORT: MyReview; LONG: MyReview };
  followingIds?: string[]; // "팔로잉" 정렬용 — 내가 팔로우하는 회원
  alwaysShowSpoilers?: boolean; // 회원 설정 "스포일러 항상 보기"
}) {
  const router = useRouter();
  const pathname = usePathname();

  function goToSignIn() {
    router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
  }

  const [activeTab, setActiveTab] = useState<ReviewTab>("SHORT");
  const [shortRating, setShortRating] = useState(myReviews.SHORT?.rating ?? 8);
  const [longRating, setLongRating] = useState(myReviews.LONG?.rating ?? 80);
  const [shortInput, setShortInput] = useState(String(myReviews.SHORT?.rating ?? 8));
  const [longInput, setLongInput] = useState(String(myReviews.LONG?.rating ?? 80));
  const [shortContent, setShortContent] = useState(myReviews.SHORT?.content ?? "");
  const [longContent, setLongContent] = useState(myReviews.LONG?.content ?? "");
  const [localMyReviews, setLocalMyReviews] = useState<{ SHORT: MyReview; LONG: MyReview }>(myReviews);
  const [localShortReviews, setLocalShortReviews] = useState(reviews.SHORT);
  const [localLongReviews, setLocalLongReviews] = useState(reviews.LONG);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
  // 이미 남긴 평점이 있으면 요약 카드만 보여주고, "수정"을 눌렀을 때만 그 탭의 폼을 펼친다.
  const [editingTab, setEditingTab] = useState<"SHORT" | "LONG" | null>(null);
  const [shortSpoiler, setShortSpoiler] = useState(myReviews.SHORT?.isSpoiler ?? false);
  const [longSpoiler, setLongSpoiler] = useState(myReviews.LONG?.isSpoiler ?? false);
  const [spoilerConfirmOpen, setSpoilerConfirmOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("likes");
  const [alwaysShow, setAlwaysShow] = useState(alwaysShowSpoilers);
  const [savingAlwaysShow, setSavingAlwaysShow] = useState(false);
  // 스포일러 리뷰 중 "눌러서 보기"로 펼친 것: id → 불러온 본문(새로고침하면 다시 가려진다).
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealLoading, setRevealLoading] = useState<Record<string, boolean>>({});

  function handleRatingChange(value: string) {
    // 숫자와 소수점만 허용, 소수점 중복 방지
    const parts = value.replace(/[^0-9.]/g, "").split(".");
    const cleaned = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : parts.join(".");
    if (activeTab === "SHORT") setShortInput(cleaned);
    else setLongInput(cleaned);
    // 별점 실시간 반영
    const num = parseFloat(cleaned);
    if (!Number.isNaN(num)) {
      const rounded = Math.round(clamp(num, 0, activeTab === "SHORT" ? 10 : 100) * 10) / 10;
      if (activeTab === "SHORT") setShortRating(rounded);
      else setLongRating(rounded);
    }
  }

  function commitRatingInput() {
    const currentScale = activeTab === "SHORT" ? 10 : 100;
    const raw = activeTab === "SHORT" ? shortInput : longInput;
    const formatted = smartFormatRating(raw, currentScale);
    if (activeTab === "SHORT") { setShortRating(formatted); setShortInput(String(formatted)); }
    else { setLongRating(formatted); setLongInput(String(formatted)); }
  }

  const content = activeTab === "SHORT" ? shortContent : longContent;
  const setContent = activeTab === "SHORT" ? setShortContent : setLongContent;
  const isSpoiler = activeTab === "SHORT" ? shortSpoiler : longSpoiler;
  const setIsSpoiler = activeTab === "SHORT" ? setShortSpoiler : setLongSpoiler;
  const tabLabel = activeTab === "SHORT" ? "한줄평" : "장문평";
  const reviewRating = activeTab === "SHORT" ? shortRating : longRating;
  const scale = activeTab === "SHORT" ? 10 : 100;
  const sentenceCount = activeTab === "SHORT" ? countSentences(content) : 0;
  const tooManySentences = activeTab === "SHORT" && sentenceCount > SHORT_MAX_SENTENCES;
  const canSubmitReview = !tooManySentences;
  const myReview = localMyReviews[activeTab];
  const showForm = !myReview || editingTab === activeTab;

  function cancelEdit() {
    const saved = localMyReviews[activeTab];
    if (saved) {
      if (activeTab === "SHORT") { setShortRating(saved.rating); setShortInput(String(saved.rating)); setShortContent(saved.content); setShortSpoiler(saved.isSpoiler); }
      else { setLongRating(saved.rating); setLongInput(String(saved.rating)); setLongContent(saved.content); setLongSpoiler(saved.isSpoiler); }
    }
    setEditingTab(null);
  }
  // SHORT: 평점만 남긴 것도 포함해서 모두 표시, LONG: 텍스트 있는 것만 표시
  const localReviews = activeTab === "SHORT" ? localShortReviews : localLongReviews;
  const visibleReviews = activeTab === "SHORT"
    ? localReviews
    : localReviews.filter((r) => r.content.trim().length > 0 || r.contentHidden);
  const followingSet = new Set(followingIds);
  const byLatest = (a: ReviewWithAuthor, b: ReviewWithAuthor) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);
  const displayReviews =
    sortMode === "friends"
      ? visibleReviews.filter((r) => followingSet.has(r.authorId)).sort(byLatest)
      : sortMode === "latest"
        ? [...visibleReviews].sort(byLatest)
        : [...visibleReviews].sort((a, b) => b.likeCount - a.likeCount || byLatest(a, b));

  function pickStars(value: number) {
    if (activeTab === "SHORT") { setShortRating(value); setShortInput(String(value)); }
    else { setLongRating(value); setLongInput(String(value)); }
  }

  // 스포일러로 가려진 본문을 이 리뷰만 불러와 펼친다.
  async function revealSpoiler(review: ReviewWithAuthor) {
    if (!review.contentHidden) {
      setRevealed((prev) => ({ ...prev, [review.id]: review.content }));
      return;
    }
    if (revealLoading[review.id]) return;
    setRevealLoading((prev) => ({ ...prev, [review.id]: true }));
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(review.id)}/content`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { content?: unknown };
      setRevealed((prev) => ({ ...prev, [review.id]: typeof data.content === "string" ? data.content : "" }));
    } catch {
      window.alert("내용을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setRevealLoading((prev) => ({ ...prev, [review.id]: false }));
    }
  }

  function hideSpoiler(reviewId: string) {
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[reviewId];
      return next;
    });
  }

  async function toggleAlwaysShow() {
    if (!isLoggedIn) {
      goToSignIn();
      return;
    }
    if (savingAlwaysShow) return;
    const next = !alwaysShow;
    setAlwaysShow(next);
    if (next) {
      // 켜면 지금 가려진 리뷰 본문을 한꺼번에 불러온다(끄면 다시 가린다).
      const pending = [...localShortReviews, ...localLongReviews].filter(
        (r) => r.contentHidden && revealed[r.id] === undefined && !revealLoading[r.id]
      );
      for (const r of pending) void revealSpoiler(r);
    } else {
      setRevealed({});
    }
    setSavingAlwaysShow(true);
    try {
      const result = await setAlwaysShowSpoilersAction(next);
      if (!result.ok) throw new Error("save failed");
    } catch {
      setAlwaysShow(!next);
      window.alert("설정을 저장하지 못했어요.");
    } finally {
      setSavingAlwaysShow(false);
    }
  }

  async function handleDeleteReview(reviewId: string) {
    if (deletingReviewId) return;
    const prevShort = localShortReviews;
    const prevLong = localLongReviews;
    setLocalShortReviews((prev) => prev.filter((r) => r.id !== reviewId));
    setLocalLongReviews((prev) => prev.filter((r) => r.id !== reviewId));
    setDeletingReviewId(reviewId);
    try {
      await deleteReviewAction({ reviewId, movieId, category });
      removeReview(reviewId);
    } catch {
      setLocalShortReviews(prevShort);
      setLocalLongReviews(prevLong);
    } finally {
      setDeletingReviewId(null);
    }
  }

  async function handleAdminDelete(reviewId: string, content: string) {
    if (!confirm(`관리자 권한으로 이 리뷰를 삭제하시겠습니까?\n\n"${content.slice(0, 60)}"`)) return;
    if (deletingReviewId) return;
    const prevShort = localShortReviews;
    const prevLong = localLongReviews;
    setLocalShortReviews((prev) => prev.filter((r) => r.id !== reviewId));
    setLocalLongReviews((prev) => prev.filter((r) => r.id !== reviewId));
    setDeletingReviewId(reviewId);
    try {
      await adminDeleteReviewAction({ reviewId });
      removeReview(reviewId);
    } catch {
      setLocalShortReviews(prevShort);
      setLocalLongReviews(prevLong);
    } finally {
      setDeletingReviewId(null);
    }
  }

  function handleSubmitReview(e: FormEvent) {
    e.preventDefault();
    if (!isLoggedIn) {
      goToSignIn();
      return;
    }
    if (!canSubmitReview || submittingReview) return;
    // 체크를 안 했는데 결말·범인 같은 단어가 있으면 등록 전에 한 번 물어본다.
    if (!isSpoiler && suggestsSpoiler(content)) {
      setSpoilerConfirmOpen(true);
      return;
    }
    void submitReview(isSpoiler);
  }

  async function submitReview(markSpoiler: boolean) {
    setSpoilerConfirmOpen(false);
    const spoilerFlag = markSpoiler && content.trim().length > 0;
    setIsSpoiler(spoilerFlag);
    setSubmittingReview(true);
    try {
      await submitReviewAction({
        movieId,
        movieCd,
        category,
        type: activeTab,
        rating: reviewRating,
        content: content.trim(),
        isSpoiler: spoilerFlag,
      });
      initForUser(userId);
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

      // 즉시 "내 평점" 패널 갱신
      const now = new Date().toISOString();
      const isNewReview = !myReview; // 제출 전 값 캡처
      setLocalMyReviews((prev) => ({
        ...prev,
        [activeTab]: { rating: reviewRating, content: content.trim(), createdAt: now, isSpoiler: spoilerFlag },
      }));
      if (userId) {
        if (isNewReview) {
          // 신규 작성: 목록 맨 앞에 낙관적 항목 추가 (카운트 즉시 +1)
          const newEntry: ReviewWithAuthor = {
            id: `optimistic-${Date.now()}`,
            rating: reviewRating,
            content: content.trim(),
            hasSpoiler: spoilerFlag,
            contentHidden: false,
            spoilerReportedByMe: false,
            authorId: userId,
            authorName: userName ?? "나",
            authorTier: "관객",
            createdAt: now,
            likeCount: 0,
            dislikeCount: 0,
            myVote: null,
          };
          if (activeTab === "SHORT") {
            setLocalShortReviews((prev) => [newEntry, ...prev]);
          } else {
            setLocalLongReviews((prev) => [newEntry, ...prev]);
          }
        } else {
          // 수정: 리뷰 목록에서 내 항목 즉시 교체
          const patchList = (prev: ReviewWithAuthor[]) =>
            prev.map((r) =>
              r.authorId === userId
                ? { ...r, rating: reviewRating, content: content.trim(), createdAt: now, hasSpoiler: spoilerFlag, contentHidden: false }
                : r
            );
          // 지금 탭(한줄평/장문평)의 내 항목만 바꾼다 — 다른 탭의 내 리뷰는 그대로다.
          if (activeTab === "SHORT") setLocalShortReviews(patchList);
          else setLocalLongReviews(patchList);
        }
      }
      setEditingTab(null);
      // 평균 평점(사이드바) 갱신을 위해 백그라운드 새로고침
      router.refresh();
    } catch {
      // 서버 저장이 실패하면(네트워크·검증 오류) 저장된 것처럼 보이지 않게 알린다 — 입력 내용은 그대로 둔다.
      window.alert("리뷰를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
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

      <section className="mt-4 rounded-2xl border border-neutral-800 bg-surface p-4">
        <h2 className="text-base font-bold text-text">
          {category === "전체" ? "이 영화, 어떠셨어요?" : `이 영화의 ${category}, 어떠셨어요?`}
        </h2>

      {myReview && !showForm && (
        <div className="mt-3 rounded-xl border border-neutral-800 bg-black/30 px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-xs font-semibold text-star">내 평점</span>
              <StarRating rating={myReview.rating} scale={scale} size="h-4 w-4" />
              {myReview.isSpoiler && (
                <span className="shrink-0 rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] text-muted">스포일러 표시</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditingTab(activeTab)}
              className="shrink-0 rounded-md border border-neutral-700 px-2.5 py-1 text-[11px] font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:text-text"
            >
              수정
            </button>
          </div>
          {myReview.content.trim() ? (
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-text">{myReview.content.trim()}</p>
          ) : (
            <p className="mt-2 text-xs text-neutral-500">{tabLabel} 없이 평점만 남겼어요</p>
          )}
          <p className="mt-1.5 text-[11px] text-neutral-500">{formatDate(myReview.createdAt)} 등록</p>
        </div>
      )}

      {showForm && (
      <form onSubmit={handleSubmitReview} className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <StarPicker rating={reviewRating} scale={scale} onPick={pickStars} />
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="decimal"
              aria-label="평점"
              value={activeTab === "SHORT" ? shortInput : longInput}
              onFocus={(e) => e.target.select()}
              onChange={(e) => handleRatingChange(e.target.value)}
              onBlur={commitRatingInput}
              className="w-16 rounded-md border border-neutral-700 bg-black/30 px-2 py-1.5 text-center text-sm text-text focus:border-star focus:outline-none"
            />
            <span className="text-xs text-neutral-500">/ {scale.toFixed(0)}</span>
          </div>
        </div>

        {activeTab === "SHORT" ? (
          <div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              maxLength={200}
              placeholder={`${category === "전체" ? "이 영화" : category}에 대해 한 줄로 남겨보세요 (최대 2문장)`}
              className="w-full rounded-lg border border-neutral-700 bg-black/30 px-3.5 py-2.5 text-sm leading-relaxed text-text placeholder:text-neutral-500 focus:border-star focus:outline-none"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className={`text-[11px] ${tooManySentences ? "text-brand" : "text-neutral-500"}`}>
                {sentenceCount}/{SHORT_MAX_SENTENCES}문장
                {tooManySentences && " · 한줄평은 2문장까지만 가능해요"}
              </p>
              <p className="text-[11px] text-neutral-500">글 없이 평점만 남겨도 돼요</p>
            </div>
          </div>
        ) : (
          <div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder={`${category === "전체" ? "이 영화" : category}에 대한 자세한 감상평을 남겨주세요`}
              className="w-full rounded-lg border border-neutral-700 bg-black/30 px-3.5 py-2.5 text-sm leading-relaxed text-text placeholder:text-neutral-500 focus:border-star focus:outline-none"
            />
            <p className="mt-1 text-right text-[11px] text-neutral-500">글 없이 평점만 남겨도 돼요</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-text">
            <input
              type="checkbox"
              checked={isSpoiler}
              onChange={(e) => setIsSpoiler(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-star)]"
            />
            스포일러가 있어요
          </label>
          <div className="flex gap-2">
            {myReview && (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:text-text"
              >
                취소
              </button>
            )}
            <button
              type="submit"
              disabled={!canSubmitReview || submittingReview}
              className="rounded-full bg-star px-5 py-2 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submittingReview ? "저장 중…" : myReview ? "수정 완료" : "등록"}
            </button>
          </div>
        </div>
      </form>
      )}
      </section>

      {spoilerConfirmOpen && (
        <SpoilerConfirmModal
          onMark={() => void submitReview(true)}
          onSubmitAsIs={() => void submitReview(false)}
          onCancel={() => setSpoilerConfirmOpen(false)}
        />
      )}

      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-text">
            {tabLabel} <span className="text-star">{visibleReviews.length}</span>개
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {SORTS.map((s) => (
              <button
                key={s.mode}
                type="button"
                onClick={() => (s.mode === "friends" && !isLoggedIn ? goToSignIn() : setSortMode(s.mode))}
                aria-pressed={sortMode === s.mode}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  sortMode === s.mode ? "bg-star text-black" : "bg-surface text-muted hover:text-text"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {isLoggedIn && (
          <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={alwaysShow}
              disabled={savingAlwaysShow}
              onChange={toggleAlwaysShow}
              className="h-3.5 w-3.5 accent-[var(--color-star)]"
            />
            스포일러 항상 보기
          </label>
        )}

        {sortMode === "friends" && displayReviews.length === 0 && (
          <p className="mt-3 text-xs text-muted">
            {followingIds.length === 0 ? "팔로우한 회원이 아직 없어요." : `팔로우한 회원이 남긴 ${tabLabel}이 아직 없어요.`}
          </p>
        )}

        <ul className="mt-3 space-y-2.5">
          {displayReviews.map((review) => {
            const isMine = Boolean(userId && review.authorId === userId);
            const hasBody = review.contentHidden || review.content.trim().length > 0;
            const isRevealed = revealed[review.id] !== undefined;
            const hidden = review.hasSpoiler && hasBody && !isMine && !alwaysShow && !isRevealed;
            const body = review.contentHidden ? (revealed[review.id] ?? "") : review.content;
            const loadingBody = review.contentHidden && !isRevealed && (alwaysShow || revealLoading[review.id]);
            return (
            <li key={review.id} className="rounded-xl bg-surface px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                <Link
                  href={`/users/${review.authorId}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-sm font-bold text-text hover:opacity-80"
                >
                  {review.authorName.charAt(0)}
                </Link>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link href={`/users/${review.authorId}`} className="truncate text-sm font-semibold text-text hover:underline">
                      {review.authorName}
                    </Link>
                    <TierBadge tier={review.authorTier} />
                  </div>
                  <p className="text-[10px] text-neutral-500">{formatDate(review.createdAt)}</p>
                </div>
                <div className="ml-auto">
                  <StarRating rating={review.rating} scale={scale} size="h-3.5 w-3.5" />
                </div>
              </div>
              {!hasBody ? (
                <p className="mt-2 text-xs text-neutral-500">평점만 남김</p>
              ) : hidden ? (
                <button
                  type="button"
                  onClick={() => void revealSpoiler(review)}
                  aria-expanded={false}
                  disabled={revealLoading[review.id]}
                  className="mt-2 w-full rounded-lg border border-dashed border-neutral-700 bg-black/30 px-3 py-2.5 text-left text-xs text-muted transition-colors hover:border-star hover:text-text disabled:opacity-60"
                >
                  {revealLoading[review.id] ? "불러오는 중…" : `스포일러가 포함된 ${tabLabel}이에요 · 눌러서 보기`}
                </button>
              ) : (
                <div className="mt-2">
                  {review.hasSpoiler && (
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] text-muted">스포일러</span>
                      {isRevealed && !alwaysShow && !isMine && (
                        <button
                          type="button"
                          onClick={() => hideSpoiler(review.id)}
                          aria-expanded={true}
                          className="text-[10px] text-muted underline-offset-2 hover:text-text hover:underline"
                        >
                          다시 가리기
                        </button>
                      )}
                    </div>
                  )}
                  {loadingBody ? (
                    <p className="text-xs text-muted">불러오는 중…</p>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{body}</p>
                  )}
                </div>
              )}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <ReviewVoteButtons
                  reviewId={review.id}
                  isLoggedIn={isLoggedIn}
                  onSignInRequired={goToSignIn}
                  initialLikeCount={review.likeCount}
                  initialDislikeCount={review.dislikeCount}
                  initialMyVote={review.myVote}
                />
                <div className="flex items-center gap-1">
                  {isMine && (
                    <button
                      type="button"
                      onClick={() => handleDeleteReview(review.id)}
                      disabled={deletingReviewId === review.id}
                      className="rounded px-2 py-1 text-xs text-muted transition-colors hover:text-red-400 disabled:opacity-50"
                    >
                      {deletingReviewId === review.id ? "삭제 중…" : "삭제"}
                    </button>
                  )}
                  {isAdmin && !isMine && (
                    <button
                      type="button"
                      onClick={() => handleAdminDelete(review.id, review.contentHidden ? `(스포일러 ${tabLabel})` : review.content)}
                      disabled={deletingReviewId === review.id}
                      className="rounded px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:text-red-400 disabled:opacity-50"
                    >
                      {deletingReviewId === review.id ? "삭제 중…" : "🚨 관리자 삭제"}
                    </button>
                  )}
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
