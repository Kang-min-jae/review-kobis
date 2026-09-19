export const TIERS = ["관객", "씨네필", "평론가", "거장"] as const;
export type Tier = (typeof TIERS)[number];

// 누적 좋아요 수(User.totalLikes) 기준 등급.
export function getBadge(totalLikes: number): Tier {
  if (totalLikes >= 1_000_000) return "거장";
  if (totalLikes >= 100_000) return "평론가";
  if (totalLikes >= 10_000) return "씨네필";
  return "관객";
}

export const TIER_STYLES: Record<Tier, { border: string; text: string; bg: string }> = {
  관객:   { border: "border-neutral-600",    text: "text-neutral-400",  bg: "bg-neutral-600/20" },
  씨네필: { border: "border-sky-500/60",     text: "text-sky-400",      bg: "bg-sky-500/20" },
  평론가: { border: "border-violet-500/60",  text: "text-violet-400",   bg: "bg-violet-500/20" },
  거장:   { border: "border-yellow-400/60",  text: "text-yellow-300",   bg: "bg-yellow-400/20" },
};
