"use client";

import type { TheaterChain } from "../_lib/mock-theaters";

export default function MovieTheaterFavorites({
  theaters,
}: {
  theaters: TheaterChain[];
  movieId: string;
}) {
  return (
    <div className="space-y-5">
      {theaters.map((theater) => (
        <section key={theater.chain}>
          <h2 className="text-sm font-bold text-brand">{theater.chain}</h2>
          <div className="mt-2">
            <a
              href={theater.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-full border border-star bg-star/10 px-4 py-2 text-xs font-semibold text-star transition-colors hover:bg-star hover:text-black"
            >
              극장으로 예매하러 가기
            </a>
          </div>
        </section>
      ))}
    </div>
  );
}
