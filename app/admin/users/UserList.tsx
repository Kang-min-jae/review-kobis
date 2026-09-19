"use client";

import { useState, useEffect, useCallback } from "react";
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

  const fetchUsers = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const data = await getAllUsersForAdmin({ search: q || undefined });
      setUsers(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(query); }, [fetchUsers, query]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery(search.trim());
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
              <Link
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
