"use client";

import Link from "next/link";
import StarRating from "./StarRating";
import type { TopReview } from "../_lib/use-top-reviews";
import { TIER_STYLES } from "../_lib/tier";
import type { Tier } from "../_lib/tier";

function TierBadge({ tier }: { tier: string }) {
  const style = TIER_STYLES[(tier as Tier)] ?? TIER_STYLES["관객"];
  return (
    <span className={`shrink-0 rounded border px-1 py-px text-[8px] font-medium leading-none ${style.border} ${style.text}`}>
      {tier}
    </span>
  );
}

// BoxOfficeCoverflow 뒤집기 카드와 TopReviewsPanel이 공유하는 한줄평 목록 UI.
// 빈 상태 문구/스타일을 두 곳에서 통일한다.
export default function TopReviewsList({
  reviews,
  loading,
}: {
  reviews: TopReview[];
  loading: boolean;
}) {
  if (loading) {
    return <div className="mt-2 text-[11px] text-muted">불러오는 중…</div>;
  }
  if (reviews.length === 0) {
    return <div className="mt-2 text-[11px] text-muted">아직 등록된 한줄평이 없어요.</div>;
  }

  return (
    <div className="mt-2 space-y-2">
      {reviews.map((r) => (
        <div key={r.id} className="rounded bg-neutral-800/60 px-2 py-1.5">
          <div className="flex items-center justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1">
              <Link href={`/users/${r.authorId}`} className="truncate text-[10px] font-semibold text-text hover:underline">
                {r.authorName}
              </Link>
              <TierBadge tier={r.authorTier} />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <StarRating rating={r.rating} scale={10} size="h-2.5 w-2.5" />
            </div>
          </div>
          {r.content.trim() && (
            <p className={`mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted ${r.isSpoiler ? "italic" : ""}`}>{r.content}</p>
          )}
          <p className="mt-0.5 text-[10px] text-muted">
            👍 {r.likeCount}
            {r.dislikeCount > 0 && <> · 👎 {r.dislikeCount}</>}
          </p>
        </div>
      ))}
    </div>
  );
}
