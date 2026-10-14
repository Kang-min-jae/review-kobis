"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { getAllUsersForAdmin } from "../../_lib/review-actions";
import { getBadge, TIER_STYLES } from "../../_lib/tier";
import type { Tier } from "../../_lib/tier";

type AdminUser = Awaited<ReturnType<typeof getAllUsersForAdmin>>[number];

function fmtDate(iso: Date) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function UserList() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  // 검색어를 빠르게 바꾸면 이전 검색 결과가 늦게 도착해 새 결과를 덮어쓸 수 있어, 가장 최근
  // 요청의 응답만 반영한다. 조회 실패도 잡아서 로딩 표시가 멈추지 않게 한다.
  const latestRequest = useRef(0);
  // 로딩 표시는 처음 화면(loading=true)과 검색 핸들러가 켜고, 여기서는 가장 최근 요청이 끝날 때 끈다.
  const fetchUsers = useCallback((q: string) => {
    const requestId = ++latestRequest.current;
    return getAllUsersForAdmin({ search: q || undefined })
      .then((data) => {
        if (requestId === latestRequest.current) setUsers(data);
      })
      .catch((error) => console.warn("[admin] 목록 조회 실패:", error))
      .finally(() => {
        if (requestId === latestRequest.current) setLoading(false);
      });
  }, []);

  useEffect(() => { fetchUsers(query); }, [fetchUsers, query]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const next = search.trim();
    if (next !== query) setLoading(true);
    setQuery(next);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="닉네임, 이름, 이메일 검색"
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
      ) : users.length === 0 ? (
        <p className="text-sm text-muted">회원이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted">{users.length}명</p>
          {users.map((u) => {
            const tier = getBadge(u.totalLikes);
            const ts = TIER_STYLES[tier as Tier];
            return (
              <Link prefetch={false}
                key={u.id}
                href={`/users/${u.id}`}
                className="flex items-center gap-3 rounded-xl bg-surface p-4 hover:bg-surface-hover transition-colors"
              >
                <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold ${ts.border} ${ts.text} ${ts.bg}`}>
                  {tier}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text truncate">
                    {u.nickname ?? u.name ?? "이름 없음"}
                    {u.role === "ADMIN" && (
                      <span className="ml-2 rounded-full bg-brand/20 px-1.5 py-0.5 text-[10px] font-medium text-brand">관리자</span>
                    )}
                  </p>
                  <p className="text-xs text-muted truncate">{u.email ?? u.id}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted">리뷰 {u._count.reviews}</p>
                  <p className="text-xs text-muted">팔로워 {u._count.followers}</p>
                  <p className="text-[10px] text-muted">{fmtDate(u.createdAt)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
