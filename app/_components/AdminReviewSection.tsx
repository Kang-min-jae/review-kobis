"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminDeleteReviewAction } from "../_lib/review-actions";
import type { UserReview } from "../_lib/review-data";

export default function AdminReviewSection({
  reviews,
}: {
  reviews: UserReview[];
  profileUserId: string;
}) {
  const router = useRouter();
  const [list, setList] = useState(reviews);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(review: UserReview) {
    const preview = review.content.slice(0, 60) || "(내용 없음)";
    if (!confirm(`관리자 권한으로 이 리뷰를 삭제하시겠습니까?\n\n"${preview}"`)) return;
    setDeletingId(review.id);
    startTransition(async () => {
      try {
        await adminDeleteReviewAction({ reviewId: review.id });
        setList((prev) => prev.filter((r) => r.id !== review.id));
        router.refresh();
      } finally {
        setDeletingId(null);
      }
    });
  }

  if (list.length === 0) return null;

  return (
    <div className="px-5">
      <h2 className="text-sm font-bold text-red-400 mb-2">🚨 관리자 — 리뷰 모더레이션 ({list.length})</h2>
      <div className="space-y-2">
        {list.map((r) => (
          <div key={r.id} className="flex items-start gap-3 rounded-xl bg-surface border border-red-500/20 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted">{r.category}</span>
                <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted">
                  {r.type === "SHORT" ? "한줄평" : "장문평"}
                </span>
              </div>
              {r.content.trim() ? (
                <p className="mt-1 text-sm text-text line-clamp-2">{r.content}</p>
              ) : (
                <p className="mt-1 text-xs text-muted italic">내용 없음 (평점만)</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleDelete(r)}
              disabled={deletingId === r.id || isPending}
              className="shrink-0 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-40"
            >
              {deletingId === r.id ? "삭제 중…" : "강제 삭제"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
