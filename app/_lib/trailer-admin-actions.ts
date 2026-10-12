"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { auth } from "../../auth";
import { CHANNEL_KEY_PATTERN } from "./official-channels";

const VIDEO_KEY_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

async function requireAdminId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") throw new Error("권한이 없습니다.");
  return session.user.id;
}

function refreshDetailPages() {
  revalidatePath("/movies/[id]/rate/category/[category]", "page");
}

// 관리자 전용 — 상세 페이지 예고편 박스의 "영상 차단" 버튼. 차단한 영상은 TMDB가 공식
// 예고편으로 내려줘도 다시는 보이지 않는다(해제는 /api/admin/blocked-videos DELETE).
export async function blockTrailerAction(input: { videoKey: string; movieCd?: string; reason?: string }) {
  const adminId = await requireAdminId();
  if (typeof input?.videoKey !== "string" || !VIDEO_KEY_PATTERN.test(input.videoKey)) throw new Error("잘못된 영상입니다.");
  const movieCd = typeof input.movieCd === "string" ? input.movieCd.slice(0, 64) : null;
  const reason = typeof input.reason === "string" ? input.reason.slice(0, 200) : null;

  await db.blockedVideoKey.upsert({
    where: { videoKey: input.videoKey },
    create: { videoKey: input.videoKey, movieCd, reason, createdBy: adminId },
    update: { movieCd, reason },
  });
  refreshDetailPages();
}

// 관리자 전용 — 예고편을 올린 채널을 "공식 채널로 허용"(allowed=true) / "차단"(false) / 규칙 삭제(null).
// 모든 영화의 예고편에 바로 적용된다.
export async function setTrailerChannelRuleAction(input: { channelKey: string; channelName?: string | null; allowed: boolean | null }) {
  const adminId = await requireAdminId();
  if (typeof input?.channelKey !== "string" || !CHANNEL_KEY_PATTERN.test(input.channelKey)) throw new Error("잘못된 채널입니다.");
  const channelName = typeof input.channelName === "string" ? input.channelName.slice(0, 200) : null;

  if (input.allowed === null) {
    await db.trailerChannelRule.deleteMany({ where: { channelKey: input.channelKey } });
  } else if (typeof input.allowed === "boolean") {
    await db.trailerChannelRule.upsert({
      where: { channelKey: input.channelKey },
      create: { channelKey: input.channelKey, channelName, allowed: input.allowed, createdBy: adminId },
      update: { channelName, allowed: input.allowed, createdBy: adminId },
    });
  } else {
    throw new Error("잘못된 요청입니다.");
  }
  refreshDetailPages();
}
