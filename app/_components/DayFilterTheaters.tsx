"use client";

import { useState } from "react";
import { daysOfWeek, getScreeningChains, type DayOfWeek } from "../_lib/mock-theaters";

export default function DayFilterTheaters({ movieId }: { movieId: string }) {
  const [day, setDay] = useState<DayOfWeek>(daysOfWeek[0]);
  const results = getScreeningChains(movieId, day);

  return (
    <div>
      <div className="flex gap-2">
        {daysOfWeek.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            className={`h-9 w-9 rounded-full text-sm font-semibold transition-colors ${
              day === d ? "bg-brand text-white" : "bg-surface text-muted hover:text-text"
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {results.length === 0 && (
          <p className="text-sm text-muted">{day}요일에 상영하는 극장이 없어요.</p>
        )}
        {results.map((theater) => (
          <section key={theater.chain}>
            <h2 className="text-sm font-bold text-brand">{theater.chain}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {theater.branches.map((branch) => (
                <span
                  key={branch.name}
                  className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-text"
                >
                  {branch.name}
                </span>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
