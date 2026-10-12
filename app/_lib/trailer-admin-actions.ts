"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { auth } from "../../auth";

const VIDEO_KEY_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

// 관리자 전용 — 상세 페이지 예고편 박스의 "이 영상 차단" 버튼. 차단한 영상은 TMDB가 공식
// 예고편으로 내려줘도 다시는 보이지 않는다(해제는 /api/admin/blocked-videos DELETE).
export async function blockTrailerAction(input: { videoKey: string; movieCd?: string; reason?: string }) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") throw new Error("권한이 없습니다.");
  if (typeof input?.videoKey !== "string" || !VIDEO_KEY_PATTERN.test(input.videoKey)) throw new Error("잘못된 영상입니다.");
  const movieCd = typeof input.movieCd === "string" ? input.movieCd.slice(0, 64) : null;
  const reason = typeof input.reason === "string" ? input.reason.slice(0, 200) : null;

  await db.blockedVideoKey.upsert({
    where: { videoKey: input.videoKey },
    create: { videoKey: input.videoKey, movieCd, reason, createdBy: session.user.id },
    update: { movieCd, reason },
  });
  revalidatePath("/movies/[id]/rate/category/[category]", "page");
}
