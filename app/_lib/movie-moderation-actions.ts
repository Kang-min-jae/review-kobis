"use server";

import { revalidateTag } from "next/cache";
import { auth } from "../../auth";
import { revalidateAllDetailPages, revalidateWorkDetailPages } from "./detail-revalidate";
import { MOVIE_MODERATION_TAG, setMovieHidden } from "./movie-moderation";
import { cdToMovieId } from "./rating-input";

const MOVIE_CD_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type MovieHiddenResult = { ok: true } | { error: string };

// 관리자 전용 — 영화를 메인·추천·목록·검색에서 숨기거나 다시 보이게 한다(자동 성인물 판정을 빠져나간 영화용).
// 상세 페이지 주소로 직접 들어오면 "표시할 수 없는 영화" 안내가 나온다.
export async function setMovieHiddenAction(input: { movieCd: string; hidden: boolean; reason?: string }): Promise<MovieHiddenResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return { error: "권한이 없습니다." };
  if (typeof input?.movieCd !== "string" || !MOVIE_CD_PATTERN.test(input.movieCd)) return { error: "잘못된 영화입니다." };
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 300) || null : null;
  try {
    await setMovieHidden(input.movieCd, input.hidden === true, reason, session.user.id);
  } catch (error) {
    console.warn("[moderation] 숨김 저장 실패:", error);
    return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  // 바뀐 목록의 캐시만 새로 만든다 — 사이트 전체 캐시는 지우지 않는다.
  // ① 뺄 작품 목록 ② 메인 줄(장르 줄 포함) ③ 비로그인 기본 추천 ④ 이 영화의 상세 페이지
  revalidateTag(MOVIE_MODERATION_TAG, { expire: 0 });
  revalidateTag("movie-rows", { expire: 0 });
  revalidateTag("recommendations", { expire: 0 });
  // 수상작(wikidata-*)은 같은 작품이 부문별로 여러 주소로 열려 주소를 다 알 수 없어 상세 페이지 전체를 다시 만든다.
  if (input.movieCd.startsWith("wikidata-")) revalidateAllDetailPages();
  else revalidateWorkDetailPages(cdToMovieId(input.movieCd));
  return { ok: true };
}
