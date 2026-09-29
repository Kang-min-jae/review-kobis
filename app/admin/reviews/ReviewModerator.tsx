"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import { adminDeleteReviewAction, getAllReviewsForAdmin } from "../../_lib/review-actions";

type AdminReview = Awaited<ReturnType<typeof getAllReviewsForAdmin>>[number];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function ReviewModerator() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 검색어를 빠르게 바꾸면 이전 검색 결과가 늦게 도착해 새 결과를 덮어쓸 수 있어, 가장 최근
  // 요청의 응답만 반영한다. 조회 실패도 잡아서 로딩 표시가 멈추지 않게 한다.
  const latestRequest = useRef(0);
  const fetchReviews = useCallback(async (q: string) => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      const data = await getAllReviewsForAdmin({ search: q || undefined });
      if (requestId === latestRequest.current) setReviews(data);
    } catch (error) {
      console.warn("[admin] 목록 조회 실패:", error);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReviews(query); }, [fetchReviews, query]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery(search.trim());
  }

  function handleDelete(review: AdminReview) {
    if (!confirm(`이 리뷰를 강제 삭제하시겠습니까?\n\n"${review.content.slice(0, 60)}"`)) return;
    setDeletingId(review.id);
    startTransition(async () => {
      try {
        await adminDeleteReviewAction({ reviewId: review.id });
        setReviews((prev) => prev.filter((r) => r.id !== review.id));
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="닉네임 또는 이름으로 검색"
          className="flex-1 rounded-lg bg-surface border border-border px-3 py-2 text-sm text-text placeholder:text-muted"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          검색
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-muted">불러오는 중...</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted">리뷰가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted">{reviews.length}개 리뷰</p>
          {reviews.map((r) => (
            <div key={r.id} className="rounded-xl bg-surface p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted">
                    {r.type === "SHORT" ? "한줄평" : "장문평"}
                  </span>
                  <span className="text-xs font-medium text-text truncate max-w-[160px]">{r.movieTitle}</span>
                  <span className="text-[10px] text-muted">{r.category}</span>
                  <span className="ml-auto text-[10px] text-muted">{fmtDate(r.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-sm text-text line-clamp-2">{r.content || <span className="text-muted italic">내용 없음</span>}</p>
                <p className="mt-1 text-xs text-muted">
                  {r.user?.nickname ?? r.user?.name ?? r.userId}
                </p>
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
      )}
    </div>
  );
}
