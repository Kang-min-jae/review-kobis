"use client";

import { INDIE_THEATERS } from "../_lib/mock-theaters";
import type { TheaterChain } from "../_lib/mock-theaters";

const MAIN_CHAINS = ["CGV", "롯데시네마", "메가박스"];

export default function MovieTheaterFavorites({
  theaters,
}: {
  theaters: TheaterChain[];
  movieId: string;
}) {
  const mainChains = theaters.filter((t) => MAIN_CHAINS.includes(t.chain));

  return (
    <div className="space-y-6">
      {/* 대형 체인 — 2열 그리드 */}
      <div className="grid grid-cols-2 gap-3">
        {mainChains.map((theater) => (
          <section key={theater.chain} className="rounded-xl bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-brand">{theater.chain}</h2>
            <a
              href={theater.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-full border border-star bg-star/10 px-4 py-2 text-xs font-semibold text-star transition-colors hover:bg-star hover:text-black"
            >
              극장으로 예매하러 가기
            </a>
          </section>
        ))}
      </div>

      {/* 독립/예술극장 */}
      <section>
        <h2 className="mb-3 text-sm font-bold text-brand">독립예술극장</h2>
        <div className="grid grid-cols-2 gap-3">
          {INDIE_THEATERS.map((theater) => (
            <div key={theater.name} className="rounded-xl bg-surface p-4">
              <p className="mb-3 text-xs font-semibold text-text">{theater.name}</p>
              <a
                href={theater.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-full border border-star bg-star/10 px-3 py-1.5 text-xs font-semibold text-star transition-colors hover:bg-star hover:text-black"
              >
                예매하러 가기
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
