"use server";

import { revalidateAllDetailPages } from "./detail-revalidate";
import { db } from "./db";
import { auth } from "../../auth";
import { CHANNEL_KEY_PATTERN, judgeChannel, parseYouTubeVideoKey } from "./official-channels";
import { loadChannelRules, lookupYouTubeChannel, TRAILER_TYPES } from "./trailers";

const VIDEO_KEY_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

async function requireAdminId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") throw new Error("권한이 없습니다.");
  return session.user.id;
}

function refreshDetailPages() {
  revalidateAllDetailPages();
}

const MOVIE_CD_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type ManualTrailerResult = { ok: true } | { error: string };

// 관리자 전용 — TMDB에 아직 없는 공식 예고편을 YouTube 주소로 직접 추가한다. 영상을 올린 채널을 YouTube
// oEmbed로 확인해, 배급사·제작사 공식 채널(기본 목록 또는 관리자가 허용한 채널)일 때만 저장한다.
// allowChannel=true면 그 채널을 공식 채널로 함께 허용한다(관리자가 공식 채널임을 직접 확인한 경우).
export async function addManualTrailerAction(input: {
  movieCd: string;
  url: string;
  type?: string;
  allowChannel?: boolean;
}): Promise<ManualTrailerResult> {
  const adminId = await requireAdminId();
  if (typeof input?.movieCd !== "string" || !MOVIE_CD_PATTERN.test(input.movieCd)) return { error: "잘못된 영화입니다." };
  const videoKey = typeof input.url === "string" ? parseYouTubeVideoKey(input.url) : null;
  if (!videoKey) return { error: "YouTube 영상 주소를 확인해 주세요. (예: https://www.youtube.com/watch?v=…)" };
  const type = typeof input.type === "string" && TRAILER_TYPES.includes(input.type) ? input.type : "Trailer";

  const blocked = await db.blockedVideoKey.findUnique({ where: { videoKey } }).catch(() => null);
  if (blocked) return { error: "차단한 영상이에요. 먼저 차단을 해제해 주세요." };

  const found = await lookupYouTubeChannel(videoKey);
  if (!found) return { error: "YouTube에서 영상 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (found.kind === "unavailable") return { error: "삭제·비공개됐거나 다른 사이트 재생(퍼가기)이 금지된 영상이에요." };

  const rules = await loadChannelRules(found.channelKey ? [found.channelKey] : []);
  const verdict = judgeChannel(found.channelName, found.channelKey, rules);
  if (verdict === "channel-blocked") return { error: `차단한 채널(${found.channelName})의 영상이에요.` };
  if (verdict !== "official") {
    if (!input.allowChannel || !found.channelKey) {
      return {
        error: `"${found.channelName}" 채널은 공식 채널 목록에 없어요. 배급사·제작사 공식 채널이 맞으면 "이 채널도 공식으로 허용"을 체크하고 다시 추가해 주세요.`,
      };
    }
    await db.trailerChannelRule.upsert({
      where: { channelKey: found.channelKey },
      create: { channelKey: found.channelKey, channelName: found.channelName.slice(0, 200), allowed: true, createdBy: adminId },
      update: { channelName: found.channelName.slice(0, 200), allowed: true, createdBy: adminId },
    });
  }

  try {
    await db.manualTrailer.upsert({
      where: { movieCd_videoKey: { movieCd: input.movieCd, videoKey } },
      create: {
        movieCd: input.movieCd,
        videoKey,
        type,
        channelName: found.channelName.slice(0, 200),
        channelKey: found.channelKey,
        createdBy: adminId,
      },
      update: { type, channelName: found.channelName.slice(0, 200), channelKey: found.channelKey },
    });
  } catch (error) {
    console.error("[trailers] 직접 추가 저장 실패:", error);
    return { error: "저장하지 못했어요. (DB에 ManualTrailer 표가 있는지 확인해 주세요)" };
  }
  refreshDetailPages();
  return { ok: true };
}

// 관리자 전용 — 직접 추가한 예고편을 목록에서 뺀다(차단과 달리 TMDB가 같은 영상을 주면 다시 보인다).
export async function removeManualTrailerAction(input: { movieCd: string; videoKey: string }) {
  await requireAdminId();
  if (typeof input?.movieCd !== "string" || !MOVIE_CD_PATTERN.test(input.movieCd)) throw new Error("잘못된 영화입니다.");
  if (typeof input.videoKey !== "string" || !VIDEO_KEY_PATTERN.test(input.videoKey)) throw new Error("잘못된 영상입니다.");
  await db.manualTrailer.deleteMany({ where: { movieCd: input.movieCd, videoKey: input.videoKey } });
  refreshDetailPages();
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
