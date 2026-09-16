"use client";

import { useState } from "react";

type FaqItem = { q: string; a: string };

export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="overflow-hidden rounded-xl bg-surface">
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left"
          >
            <span className="text-sm font-medium text-text">{item.q}</span>
            <span className="ml-3 shrink-0 text-muted transition-transform duration-200" style={{ transform: open === i ? "rotate(180deg)" : "none" }}>
              ∨
            </span>
          </button>
          {open === i && (
            <div className="border-t border-white/5 px-4 pb-4 pt-3">
              <p className="text-xs leading-relaxed text-muted">{item.a}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
