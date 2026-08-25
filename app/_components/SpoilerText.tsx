"use client";

import { useState } from "react";
import { containsSpoilerKeyword } from "../_lib/spoiler";

function Segment({ text, className }: { text: string; className?: string }) {
  const [revealed, setRevealed] = useState(false);
  const isSpoiler = containsSpoilerKeyword(text);

  if (!isSpoiler || revealed) {
    return <p className={className}>{text}</p>;
  }

  return (
    <button type="button" onClick={() => setRevealed(true)} className="block w-full text-left">
      <p className={`${className ?? ""} blur-sm select-none`}>{text}</p>
      <span className="mt-0.5 inline-block text-[10px] font-semibold text-brand">
        스포일러 포함 · 클릭해서 보기
      </span>
    </button>
  );
}

// 리뷰 본문을 문단(줄바꿈) 단위로 나눠서, "결말"·생사 관련 키워드가 있는 문단만
// 블러 처리한다. 클릭하면 그 문단만 보인다.
export default function SpoilerText({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const paragraphs = content.split(/\n+/).filter((p) => p.trim().length > 0);

  if (paragraphs.length <= 1) {
    return <Segment text={content} className={className} />;
  }

  return (
    <div className="space-y-1.5">
      {paragraphs.map((paragraph, i) => (
        <Segment key={i} text={paragraph} className={className} />
      ))}
    </div>
  );
}
