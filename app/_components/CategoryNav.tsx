"use client";

import { useState } from "react";

const categories = ["TV프로그램", "영화", "단편·독립", "현재 상영중인 영화"];

export default function CategoryNav() {
  const [active, setActive] = useState(categories[1]);

  return (
    <nav className="flex gap-4 px-5 pb-5">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => setActive(category)}
          className={`text-sm transition-colors ${
            active === category ? "font-bold text-brand" : "text-brand/60 hover:text-brand"
          }`}
        >
          {category}
        </button>
      ))}
    </nav>
  );
}
