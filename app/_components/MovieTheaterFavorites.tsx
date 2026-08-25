"use client";

import { useState, useSyncExternalStore } from "react";
import type { TheaterChain } from "../_lib/mock-theaters";
import {
  subscribe,
  getFavoriteTheatersSnapshot,
  getServerFavoriteTheatersSnapshot,
  isFavoriteTheater,
  toggleFavoriteTheater,
} from "../_lib/theater-favorites-store";

// 영화별 예매 화면: 체인마다 "즐겨찾기한 지점"만 보여주고, 그 지점에 이 영화 상영
// 일정이 있으면 바로 예매로 연결한다. 즐겨찾기한 지점이 아직 없는 체인은 + 버튼만
// 보여준다 — 누르면 자주 가는 지점을 고르는 패널이 펼쳐진다.
export default function MovieTheaterFavorites({
  theaters,
  movieId,
}: {
  theaters: TheaterChain[];
  movieId: string;
}) {
  const favorites = useSyncExternalStore(
    subscribe,
    getFavoriteTheatersSnapshot,
    getServerFavoriteTheatersSnapshot
  );
  const [openChain, setOpenChain] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {theaters.map((theater) => {
        const favoriteBranches = theater.branches.filter((b) =>
          isFavoriteTheater(favorites, { chain: theater.chain, name: b.name })
        );
        const playingHere = favoriteBranches.filter((b) => b.movieIds.includes(movieId));
        const isOpen = openChain === theater.chain;

        return (
          <section key={theater.chain}>
            <h2 className="text-sm font-bold text-brand">{theater.chain}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {playingHere.map((branch) => (
                <a
                  key={branch.name}
                  href={branch.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-star bg-star/10 px-3 py-1.5 text-xs font-semibold text-star transition-colors hover:bg-star hover:text-black"
                >
                  {branch.name} · 예매하러 가기
                </a>
              ))}
              <button
                type="button"
                onClick={() => setOpenChain(isOpen ? null : theater.chain)}
                aria-label="자주 가는 극장 설정"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 text-muted transition-colors hover:border-brand hover:text-brand"
              >
                +
              </button>
            </div>

            {favoriteBranches.length > 0 && playingHere.length === 0 && (
              <p className="mt-1.5 text-[11px] text-muted">
                즐겨찾기한 {theater.chain} 지점에는 이 영화 상영 일정이 없어요.
              </p>
            )}

            {isOpen && (
              <div className="mt-2 flex flex-wrap gap-2 rounded-lg bg-surface p-2.5">
                {theater.branches.map((branch) => {
                  const isFavorite = isFavoriteTheater(favorites, {
                    chain: theater.chain,
                    name: branch.name,
                  });
                  return (
                    <button
                      key={branch.name}
                      type="button"
                      onClick={() =>
                        toggleFavoriteTheater({ chain: theater.chain, name: branch.name, url: branch.url })
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        isFavorite
                          ? "border-star bg-star text-black"
                          : "border-neutral-700 text-text hover:border-brand hover:text-brand"
                      }`}
                    >
                      {isFavorite ? "✓ " : ""}
                      {branch.name}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
