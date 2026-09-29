"use client";

import { useState, useEffect, useCallback } from "react";

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

type FilterStatus = "전체" | "답변 대기" | "처리 완료";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function InquiryManager() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("전체");

  const fetchInquiries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/inquiry");
      if (res.ok) setInquiries(await res.json());
    } catch {
      // 네트워크 오류 — 목록은 그대로 두고 로딩만 끝낸다
    } finally {
      setLoading(false);
    }
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
      <div className="flex items-center gap-3 flex-wrap">
        {pendingCount > 0 && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">{pendingCount}건 대기</span>
        )}
        <div className="ml-auto flex gap-1">
          {(["전체", "답변 대기", "처리 완료"] as FilterStatus[]).map((s) => (
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
                  {inq.adminReply && (
                    <div>
                      <p className="text-xs font-medium text-muted mb-1">기존 답변</p>
                      <p className="text-sm text-muted whitespace-pre-wrap">{inq.adminReply}</p>
                    </div>
                  )}
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
