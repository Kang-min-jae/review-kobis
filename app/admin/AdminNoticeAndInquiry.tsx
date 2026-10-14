"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useTransition } from "react";
import { revalidateOfficialWinnersCache } from "../_lib/award-vote-actions";

type Notice = {
  id: string;
  type: string;
  title: string;
  content: string | null;
  isNew: boolean;
  createdAt: string;
};

const NOTICE_TYPES = ["업데이트", "신규 기능", "점검 안내", "공지"] as const;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function NoticeTab() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<string>(NOTICE_TYPES[0]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isNew, setIsNew] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notice");
      if (res.ok) setNotices(await res.json());
    } catch {
      // 네트워크 오류 — 목록은 그대로 두고 로딩만 끝낸다
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotices(); }, [fetchNotices]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/admin/notice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, title, content, isNew }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "오류가 발생했습니다.");
      return;
    }
    setTitle("");
    setContent("");
    setIsNew(true);
    fetchNotices();
  }

  async function handleDelete(id: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    await fetch(`/api/admin/notice?id=${id}`, { method: "DELETE" });
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="rounded-xl bg-surface p-5 space-y-4">
        <h2 className="text-base font-semibold text-text">새 공지사항 등록</h2>
        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-muted">구분</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="rounded-lg bg-bg border border-border px-3 py-2 text-sm text-text"
            >
              {NOTICE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 justify-end">
            <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
              <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} className="accent-brand" />
              NEW 배지
            </label>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="공지 제목"
            maxLength={200}
            required
            className="rounded-lg bg-bg border border-border px-3 py-2 text-sm text-text placeholder:text-muted"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">내용 (선택)</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="공지 내용을 입력하세요"
            rows={4}
            className="rounded-lg bg-bg border border-border px-3 py-2 text-sm text-text placeholder:text-muted resize-none"
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "등록 중..." : "공지사항 등록"}
        </button>
      </form>

      <div>
        <h2 className="text-base font-semibold text-text mb-3">등록된 공지사항 ({notices.length})</h2>
        {loading ? (
          <p className="text-sm text-muted">불러오는 중...</p>
        ) : notices.length === 0 ? (
          <p className="text-sm text-muted">등록된 공지사항이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {notices.map((n) => (
              <div key={n.id} className="flex items-start gap-3 rounded-xl bg-surface p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[11px] font-medium text-brand">{n.type}</span>
                    {n.isNew && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-400">NEW</span>}
                    <span className="text-xs text-muted">{fmtDate(n.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-text truncate">{n.title}</p>
                  {n.content && <p className="mt-0.5 text-xs text-muted line-clamp-2">{n.content}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(n.id)}
                  className="shrink-0 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AwardCacheSection() {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function handleRevalidate() {
    startTransition(async () => {
      try {
        await revalidateOfficialWinnersCache();
        setMsg("공식 수상작 캐시가 즉시 재검증됐습니다.");
      } catch {
        setMsg("권한이 없거나 오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-neutral-700 bg-surface p-5">
        <p className="text-sm font-semibold text-text">공식 수상작 캐시 재검증</p>
        <p className="mt-1 text-xs text-muted">
          Wikidata에서 수상작을 새로 불러온 뒤 캐시를 즉시 무효화합니다.
        </p>
        <button
          type="button"
          onClick={handleRevalidate}
          disabled={isPending}
          className="mt-4 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {isPending ? "재검증 중..." : "지금 재검증"}
        </button>
        {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
      </div>

      <div className="rounded-xl border border-neutral-700 bg-surface p-5">
        <p className="text-sm font-semibold text-text">공식 수상작 수동 관리</p>
        <p className="mt-1 text-xs text-muted">
          영화제별 부문 수상작을 직접 등록하거나 삭제합니다.
        </p>
        <Link prefetch={false}
          href="/admin/winners"
          className="mt-4 inline-block rounded-full bg-surface-hover px-5 py-2 text-sm font-semibold text-text transition-opacity hover:opacity-80"
        >
          수상작 관리 →
        </Link>
      </div>
    </div>
  );
}

type Tab = "notice" | "awards";

export default function AdminNoticeAndInquiry() {
  const [tab, setTab] = useState<Tab>("notice");

  return (
    <div>
      <div className="flex gap-1 rounded-xl bg-surface p-1">
        {([["notice", "공지사항"], ["awards", "시상식"]] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              tab === key ? "bg-brand text-white shadow-sm" : "text-muted hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === "notice" ? <NoticeTab /> : <AwardCacheSection />}
      </div>
    </div>
  );
}
