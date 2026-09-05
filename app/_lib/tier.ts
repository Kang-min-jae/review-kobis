export const TIERS = ["관객", "씨네필", "평론가", "거장"] as const;
export type Tier = (typeof TIERS)[number];

// 누적 좋아요 수(User.totalLikes) 기준 등급.
export function getBadge(totalLikes: number): Tier {
  if (totalLikes >= 1_000_000) return "거장";
  if (totalLikes >= 100_000) return "평론가";
  if (totalLikes >= 10_000) return "씨네필";
  return "관객";
}
