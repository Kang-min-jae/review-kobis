// 영화제별 시상 부문 — 투표 화면(AwardsVoting)·관리자 수상작 등록(WinnersManager)·서버 액션이
// 같은 목록을 쓴다. 서버 액션은 밖에서 직접 호출될 수 있어서, 이 목록에 없는 영화제·부문은 받지 않는다.

export type FestivalId = "academy" | "cannes" | "berlin" | "venice";

export const FESTIVAL_AWARDS: Record<FestivalId, string[]> = {
  academy: ["작품상", "감독상", "남우주연상", "여우주연상", "남우조연상", "여우조연상", "각본상", "각색상", "국제영화상", "촬영상", "편집상", "음악상"],
  cannes:  ["황금종려상", "심사위원대상", "감독상", "남우주연상", "여우주연상", "각본상", "심사위원특별상"],
  berlin:  ["황금곰상", "심사위원대상", "감독상", "남우주연상", "여우주연상", "각본상", "특별심사위원상"],
  venice:  ["황금사자상", "심사위원대상", "감독상", "각본상", "볼피컵 남우주연상", "볼피컵 여우주연상", "특별심사위원상", "마르첼로 마스트로이안니상"],
};

export function isValidAward(festival: unknown, awardCategory: unknown): festival is FestivalId {
  return (
    typeof festival === "string" &&
    Object.hasOwn(FESTIVAL_AWARDS, festival) &&
    typeof awardCategory === "string" &&
    FESTIVAL_AWARDS[festival as FestivalId].includes(awardCategory)
  );
}

// 포스터는 next/image로 그리는데, next.config.ts에 등록되지 않은 주소면 렌더링 중 오류가 나
// 그 부문 화면 전체가 깨진다. 등록된 이미지 호스트의 주소만 받는다.
const ALLOWED_POSTER_HOSTS = new Set(["image.tmdb.org", "file.koreafilm.or.kr"]);

export function sanitizePosterUrl(url: unknown): string | null {
  if (typeof url !== "string" || url.length > 500) return null;
  try {
    const parsed = new URL(url);
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !ALLOWED_POSTER_HOSTS.has(parsed.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}
