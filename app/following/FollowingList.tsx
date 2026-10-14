"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getBadge, TIER_STYLES, type Tier } from "../_lib/tier";

type FollowingUser = {
  id: string;
  name: string | null;
  image: string | null;
  nickname: string | null;
  totalLikes?: number;
};

const STORAGE_KEY = "review-site:following-favorites";

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favorites: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
  } catch {}
}

export default function FollowingList({ users }: { users: FollowingUser[] }) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return next;
    });
  }

  const sorted = [...users].sort((a, b) => {
    const af = favorites.has(a.id) ? 0 : 1;
    const bf = favorites.has(b.id) ? 0 : 1;
    return af - bf;
  });

  if (users.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">아직 팔로우한 사람이 없어요.</p>;
  }

  return (
    <div className="mt-5 space-y-2">
      {sorted.map((user) => {
        const name = user.nickname ?? user.name ?? "사용자";
        const tier = getBadge(user.totalLikes ?? 0);
        const tierStyle = TIER_STYLES[tier as Tier];
        const isFav = favorites.has(user.id);
        return (
          <div key={user.id} className="flex items-center gap-2">
            <button
              type="button"
              aria-label={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
              onClick={() => toggleFavorite(user.id)}
              className="shrink-0 p-1 text-xl leading-none transition-transform active:scale-90"
            >
              {isFav ? (
                <span className="text-star">★</span>
              ) : (
                <span className="text-muted">☆</span>
              )}
            </button>
            <Link prefetch={false}
              href={`/users/${user.id}`}
              className="flex flex-1 items-center gap-3 rounded-lg bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
            >
              <span
                className={`shrink-0 rounded border px-2 py-1 text-xs font-bold ${tierStyle.border} ${tierStyle.text} ${tierStyle.bg}`}
              >
                {tier}
              </span>
              <span className="flex-1 truncate text-sm text-text">{name}</span>
              <span className="text-xs text-muted">→</span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
