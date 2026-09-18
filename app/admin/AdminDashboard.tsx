"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { revalidateOfficialWinnersCache } from "../_lib/award-vote-actions";

// ── 공통 타입 ──────────────────────────────────────────────────────────────

type Notice = {
  id: string;
  type: string;
  title: string;
  content: string | null;
  isNew: boolean;
  createdAt: string;
};

type Inquiry = {
  id: string;
  category: string;
  title: string;
  content: string;
  status: string;
  adminReply: string | null;
  createdAt: string;
  user: { id: string; nickname: string | null; email: string | null };
};

const NOTICE_TYPES = ["업데이트", "신규 기능", "점검 안내", "공지"] as const;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// ── 공지사항 탭 ─────────────────────────────────────────────────────────────

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
    const res = await fetch("/api/admin/notice");
    if (res.ok) setNotices(await res.json());
    setLoading(false);
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
      {/* 작성 폼 */}
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

      {/* 목록 */}
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

// ── 1:1 문의 탭 ─────────────────────────────────────────────────────────────

function InquiryTab() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"전체" | "답변 대기" | "처리 완료">("전체");

  const fetchInquiries = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/inquiry");
    if (res.ok) setInquiries(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchInquiries(); }, [fetchInquiries]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    const res = await fetch("/api/admin/inquiry", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, adminReply: reply }),
    });
    setSubmitting(false);
    if (!res.ok) return;
    setInquiries((prev) =>
      prev.map((inq) =>
        inq.id === selected.id ? { ...inq, adminReply: reply, status: "처리 완료" } : inq
      )
    );
    setSelected(null);
    setReply("");
  }

  const filtered = filterStatus === "전체" ? inquiries : inquiries.filter((i) => i.status === filterStatus);
  const pendingCount = inquiries.filter((i) => i.status === "답변 대기").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-text">1:1 문의 목록</h2>
        {pendingCount > 0 && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">{pendingCount}</span>
        )}
        <div className="ml-auto flex gap-1">
          {(["전체", "답변 대기", "처리 완료"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterStatus === s ? "bg-brand text-white" : "bg-surface text-muted hover:text-text"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted">불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">문의가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((inq) => (
            <div key={inq.id}>
              <button
                type="button"
                onClick={() => {
                  if (selected?.id === inq.id) {
                    setSelected(null);
                    setReply("");
                  } else {
                    setSelected(inq);
                    setReply(inq.adminReply ?? "");
                  }
                }}
                className="w-full rounded-xl bg-surface p-4 text-left hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    inq.status === "답변 대기" ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400"
                  }`}>
                    {inq.status}
                  </span>
                  <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] text-muted">{inq.category}</span>
                  <span className="text-xs text-muted ml-auto">{fmtDate(inq.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-sm font-medium text-text">{inq.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {inq.user.nickname ?? inq.user.email ?? inq.user.id}
                </p>
              </button>

              {selected?.id === inq.id && (
                <div className="mt-1 rounded-xl bg-surface border border-border p-4 space-y-4">
                  <div>
                    <p className="text-xs font-medium text-muted mb-1">문의 내용</p>
                    <p className="text-sm text-text whitespace-pre-wrap">{inq.content}</p>
                  </div>

                  <form onSubmit={handleReply} className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted">관리자 답변</label>
                      <textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="답변을 입력하세요"
                        rows={5}
                        required
                        className="mt-1 w-full rounded-lg bg-bg border border-border px-3 py-2 text-sm text-text placeholder:text-muted resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {submitting ? "저장 중..." : inq.adminReply ? "답변 수정" : "답변 등록"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSelected(null); setReply(""); }}
                        className="rounded-lg bg-surface-hover px-4 py-2 text-sm text-muted"
                      >
                        취소
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 메인 대시보드 ────────────────────────────────────────────────────────────


// ── 시상식 캐시 탭 ────────────────────────────────────────────────────────────
function AwardCacheTab() {
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
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-700 bg-surface p-5">
        <p className="text-sm font-semibold text-text">공식 수상작 캐시 재검증</p>
        <p className="mt-1 text-xs text-muted">
          Wikidata에서 수상작을 새로 불러온 뒤 캐시를 즉시 무효화합니다.
          시상식 결과 발표 직후에 클릭하면 모든 사용자에게 즉시 반영됩니다.
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
    </div>
  );
}

type Tab = "inquiry" | "notice" | "awards";

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("inquiry");

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <h1 className="text-xl font-bold text-text">관리자 페이지</h1>
      <p className="mt-1 text-sm text-muted">공지사항 관리 및 1:1 문의 답변</p>

      <div className="mt-5 flex gap-1 rounded-xl bg-surface p-1">
        {([["inquiry", "1:1 문의"], ["notice", "공지사항"], ["awards", "시상식"]] as [Tab, string][]).map(([key, label]) => (
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
        {tab === "notice" ? <NoticeTab /> : tab === "awards" ? <AwardCacheTab /> : <InquiryTab />}
      </div>
    </div>
  );
}
