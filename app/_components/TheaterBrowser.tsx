"use client";

import { useSyncExternalStore } from "react";
import type { TheaterChain } from "../_lib/mock-theaters";
import {
  subscribe,
  getFavoriteTheatersSnapshot,
  getServerFavoriteTheatersSnapshot,
  isFavoriteTheater,
  toggleFavoriteTheater,
} from "../_lib/theater-favorites-store";

export default function TheaterBrowser({ theaters }: { theaters: TheaterChain[] }) {
  const favorites = useSyncExternalStore(
    subscribe,
    getFavoriteTheatersSnapshot,
    getServerFavoriteTheatersSnapshot
  );

  return (
    <div className="mt-6 space-y-6">
      <section>
        <h2 className="text-sm font-bold text-star">즐겨찾기 영화관</h2>
        {favorites.length === 0 ? (
          <p className="mt-2 text-xs text-muted">
            관심있는 영화관 옆의 + 버튼을 눌러 즐겨찾기에 추가해 보세요.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {favorites.map((f) => (
              <span
                key={`${f.chain}-${f.name}`}
                className="flex items-center gap-1 rounded-full border border-star pl-3 pr-1 py-1 text-xs text-star"
              >
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {f.chain} · {f.name}
                </a>
                <button
                  type="button"
                  onClick={() => toggleFavoriteTheater(f)}
                  aria-label="즐겨찾기 해제"
                  className="flex h-5 w-5 items-center justify-center rounded-full text-star/70 hover:bg-star hover:text-black"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {theaters.map((theater) => (
        <section key={theater.chain}>
          <h2 className="text-sm font-bold text-brand">
            <a href={theater.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {theater.chain}
            </a>
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {theater.branches.map((branch) => {
              const isFavorite = isFavoriteTheater(favorites, { chain: theater.chain, name: branch.name });
              return (
                <span
                  key={branch.name}
                  className="flex items-center gap-1 rounded-full border border-neutral-700 pl-3 pr-1 py-1 text-xs text-text"
                >
                  <a
                    href={branch.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-brand"
                  >
                    {branch.name}
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      toggleFavoriteTheater({ chain: theater.chain, name: branch.name, url: branch.url })
                    }
                    aria-label={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                    className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
                      isFavorite
                        ? "bg-star text-black"
                        : "text-muted hover:bg-neutral-700 hover:text-text"
                    }`}
                  >
                    {isFavorite ? "✓" : "+"}
                  </button>
                </span>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
