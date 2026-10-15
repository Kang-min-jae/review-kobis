// 영화 상세 페이지 "공식 예고편 확인하기" — 배급사·제작사 공식 YouTube 채널이 올린 예고편만 보여준다.
//
// 1) TMDB /movie/{id}/videos를 ko-KR, en-US로 각각 받아 key 기준으로 합친다(서버에서만 호출 —
//    API 키는 브라우저로 나가지 않는다).
// 2) site === "YouTube" && official === true && type이 TRAILER_TYPES에 있는 것만 후보로 남긴다.
// 3) TMDB의 official 표시는 TMDB 회원이 입력하는 값이라 개인·모음 채널("예고편 저장소" 등) 영상도
//    섞여 있다. 그래서 후보마다 YouTube oEmbed로 실제 업로드 채널을 확인하고, 배급사·제작사 공식
//    채널(official-channels.ts 목록 + 관리자가 허용한 채널)인 것만 보여준다. 채널을 확인하지 못한
//    영상, 삭제·비공개·퍼가기 금지 영상도 숨긴다.
// 4) 한국어 영상 먼저 → Trailer가 Teaser보다 먼저 → 최신 공개일 순으로 정렬한다.
// 5) 영화마다 24시간 DB에 캐시한다(TrailerCache). TMDB 호출이 실패하면 마지막으로 성공한
//    결과를 쓰고, 그것도 없으면 "영상 없음"으로 처리한다 — 어떤 경우에도 페이지는 오류가 나지 않는다.
// 6) 관리자가 막은 영상(BlockedVideoKey)·채널(TrailerChannelRule)은 캐시와 상관없이 매번 걸러서 바로 반영된다.
// 7) TMDB에 아직 없는 국내 배급사 예고편은 관리자가 상세 페이지에서 YouTube 주소로 직접 추가한다(ManualTrailer).
//    추가할 때 업로드 채널이 공식 채널인지 확인하고, 보여줄 때도 6)의 규칙을 똑같이 적용한다. 목록 맨 앞에 놓는다.

import { cache } from "react";
import { db } from "./db";
import { getTmdbMovieVideos, type RawTmdbVideo } from "./tmdb";
import { channelKeyFromUrl, judgeChannel, type ChannelRules } from "./official-channels";

// 보여줄 영상 유형. 클립까지 보여주려면 "Clip"을 추가하면 된다(라벨은 TYPE_LABELS에 이미 있음).
export const TRAILER_TYPES: readonly string[] = ["Trailer", "Teaser"];
export const MAX_TRAILERS = 3;
const MAX_CANDIDATES = 15;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// 일부 영상의 채널 확인이 일시적으로 실패하면 24시간 대신 1시간 뒤에 다시 확인한다.
const RETRY_AFTER_MS = 60 * 60 * 1000;
const OEMBED_TIMEOUT_MS = 5000;

const TYPE_LABELS: Record<string, string> = {
  Trailer: "메인 예고편",
  Teaser: "티저",
  Clip: "클립",
};

type TmdbCandidate = {
  key: string;
  type: string;
  lang: string; // iso_639_1 ("ko" | "en" | …)
  publishedAt: string | null;
};

// 캐시에 저장하는 형태(차단 필터 전, 정렬까지 끝난 후보 목록 + 업로드 채널 확인 결과).
type CachedVideo = TmdbCandidate & {
  channelChecked: boolean; // oEmbed로 채널 확인을 마쳤는지
  channelName: string | null;
  channelKey: string | null; // "@handle" | "channel/UC…" …
  embeddable: boolean | null; // false = 삭제·비공개·퍼가기 금지
};

export type OfficialTrailer = {
  key: string;
  label: string; // "메인 예고편", "티저 · 영어", "메인 예고편 2" …
  channelName: string | null;
};

export type TrailerCandidateStatus = "official" | "unverified" | "channel-blocked" | "video-blocked" | "unavailable";

// 관리자 화면용 — 숨겨진 후보까지 왜 숨겨졌는지와 함께 보여준다.
export type TrailerCandidate = {
  key: string;
  label: string;
  channelName: string | null;
  channelKey: string | null;
  status: TrailerCandidateStatus;
  manual: boolean; // 관리자가 직접 추가한 영상
};

export type TrailerData = { trailers: OfficialTrailer[]; candidates: TrailerCandidate[] };

// 채널 확인 필드까지 있는 캐시 항목만 인정한다(이전 형식 캐시는 다시 받아 채널을 확인한다).
function isCachedVideo(v: unknown): v is CachedVideo {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.key === "string" &&
    typeof o.type === "string" &&
    typeof o.lang === "string" &&
    typeof o.channelChecked === "boolean" &&
    (o.channelName === null || typeof o.channelName === "string") &&
    (o.channelKey === null || typeof o.channelKey === "string")
  );
}

// YouTube 영상 ID 형식(영문·숫자·-·_ 11자 안팎)만 받는다 — 임베드 URL에 그대로 들어가기 때문.
const YOUTUBE_KEY_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

export function pickOfficialVideos(lists: RawTmdbVideo[][]): TmdbCandidate[] {
  const byKey = new Map<string, TmdbCandidate>();
  for (const list of lists) {
    for (const v of list) {
      if (!v || typeof v.key !== "string" || !YOUTUBE_KEY_PATTERN.test(v.key)) continue;
      if (v.site !== "YouTube" || v.official !== true) continue;
      if (typeof v.type !== "string" || !TRAILER_TYPES.includes(v.type)) continue;
      if (byKey.has(v.key)) continue; // ko-KR 결과를 먼저 넣으므로 같은 영상이면 한국어 정보가 남는다
      byKey.set(v.key, {
        key: v.key,
        type: v.type,
        lang: (v.iso_639_1 ?? "").toLowerCase(),
        publishedAt: typeof v.published_at === "string" ? v.published_at : null,
      });
    }
  }
  const typeRank = (t: string) => {
    const i = TRAILER_TYPES.indexOf(t);
    return i === -1 ? TRAILER_TYPES.length : i;
  };
  return [...byKey.values()].sort((a, b) => {
    const ko = Number(b.lang === "ko") - Number(a.lang === "ko");
    if (ko !== 0) return ko;
    const type = typeRank(a.type) - typeRank(b.type);
    if (type !== 0) return type;
    return (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0);
  });
}

function baseLabel(v: TmdbCandidate): string {
  const typeLabel = TYPE_LABELS[v.type] ?? "예고편";
  return v.lang === "ko" ? typeLabel : v.lang === "en" ? `${typeLabel} · 영어` : `${typeLabel} · 해외`;
}

export function labelTrailers(videos: CachedVideo[]): OfficialTrailer[] {
  const base = videos.map(baseLabel);
  // 같은 라벨이 여러 개면 두 번째부터 번호를 붙여 구분한다("메인 예고편", "메인 예고편 2").
  const seen = new Map<string, number>();
  return videos.map((v, i) => {
    const n = (seen.get(base[i]) ?? 0) + 1;
    seen.set(base[i], n);
    return { key: v.key, label: n === 1 ? base[i] : `${base[i]} ${n}`, channelName: v.channelName };
  });
}

type ChannelLookup =
  | { kind: "ok"; channelName: string; channelKey: string | null }
  | { kind: "unavailable" } // 삭제·비공개·퍼가기 금지·잘못된 영상
  | null; // 일시적 실패(네트워크·429 등) — 다음에 다시 확인

// YouTube oEmbed(키 불필요)로 영상을 올린 채널 이름과 주소를 확인한다.
export async function lookupYouTubeChannel(videoKey: string): Promise<ChannelLookup> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoKey}`;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
    });
    if (res.status >= 400 && res.status < 500 && res.status !== 429) return { kind: "unavailable" };
    if (!res.ok) return null;
    const data = (await res.json()) as { author_name?: unknown; author_url?: unknown };
    if (typeof data.author_name !== "string" || !data.author_name.trim()) return null;
    return { kind: "ok", channelName: data.author_name.trim(), channelKey: channelKeyFromUrl(data.author_url) };
  } catch {
    return null;
  }
}

async function withChannels(
  picks: TmdbCandidate[],
  previous: CachedVideo[]
): Promise<{ videos: CachedVideo[]; incomplete: boolean }> {
  const prevByKey = new Map(previous.filter((v) => v.channelChecked).map((v) => [v.key, v]));
  let incomplete = false;
  const videos = await Promise.all(
    picks.map(async (v): Promise<CachedVideo> => {
      const found = await lookupYouTubeChannel(v.key);
      if (found?.kind === "ok") {
        return { ...v, channelChecked: true, channelName: found.channelName, channelKey: found.channelKey, embeddable: true };
      }
      if (found?.kind === "unavailable") {
        return { ...v, channelChecked: true, channelName: null, channelKey: null, embeddable: false };
      }
      // 일시적 실패: 예전에 확인해 둔 결과가 있으면 그대로 쓰고, 없으면 미확인(숨김)으로 두고 곧 다시 확인한다.
      incomplete = true;
      const prev = prevByKey.get(v.key);
      return prev
        ? { ...v, channelChecked: true, channelName: prev.channelName, channelKey: prev.channelKey, embeddable: prev.embeddable }
        : { ...v, channelChecked: false, channelName: null, channelKey: null, embeddable: null };
    })
  );
  return { videos, incomplete };
}

async function fetchFromTmdb(tmdbId: string, previous: CachedVideo[]): Promise<{ videos: CachedVideo[]; incomplete: boolean } | null> {
  const [ko, en] = await Promise.all([getTmdbMovieVideos(tmdbId, "ko-KR"), getTmdbMovieVideos(tmdbId, "en-US")]);
  if (ko === null && en === null) return null; // 둘 다 실패(키 없음·네트워크 오류)
  return withChannels(pickOfficialVideos([ko ?? [], en ?? []]).slice(0, MAX_CANDIDATES), previous);
}

async function loadCandidates(tmdbId: string): Promise<CachedVideo[]> {
  const cached = await db.trailerCache.findUnique({ where: { tmdbId } }).catch(() => null);
  const raw = cached && Array.isArray(cached.videos) ? (cached.videos as unknown[]) : null;
  const cachedVideos = raw ? raw.filter(isCachedVideo) : null;
  // 채널 확인 전 형식(이전 버전)의 캐시가 섞여 있으면 기한과 상관없이 다시 받는다.
  const sameFormat = raw !== null && cachedVideos !== null && cachedVideos.length === raw.length;
  if (cached && cachedVideos && sameFormat && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) return cachedVideos;

  const fresh = await fetchFromTmdb(tmdbId, cachedVideos ?? []).catch(() => null);
  if (fresh === null) return cachedVideos ?? []; // TMDB 실패 → 마지막 성공 결과(없으면 영상 없음)

  // 채널 확인이 덜 끝났으면 1시간 뒤에 만료되도록 받은 시각을 앞당겨 저장한다.
  const fetchedAt = new Date(fresh.incomplete ? Date.now() - (CACHE_TTL_MS - RETRY_AFTER_MS) : Date.now());
  await db.trailerCache
    .upsert({
      where: { tmdbId },
      create: { tmdbId, videos: fresh.videos, fetchedAt },
      update: { videos: fresh.videos, fetchedAt },
    })
    .catch(() => null);
  return fresh.videos;
}

export async function loadChannelRules(channelKeys: string[]): Promise<ChannelRules> {
  const rows =
    channelKeys.length === 0
      ? []
      : await db.trailerChannelRule
          .findMany({ where: { channelKey: { in: channelKeys } }, select: { channelKey: true, allowed: true } })
          .catch(() => []); // 테이블이 아직 없어도(마이그레이션 전) 기본 목록만으로 동작한다
  return {
    allowed: new Set(rows.filter((r) => r.allowed).map((r) => r.channelKey)),
    blocked: new Set(rows.filter((r) => !r.allowed).map((r) => r.channelKey)),
  };
}

// 관리자가 직접 추가한 예고편 — 한국 배급사 영상이라 한국어로 취급하고, 채널은 추가할 때 확인해 둔 값을 쓴다.
async function loadManualVideos(movieCd: string | null): Promise<CachedVideo[]> {
  if (!movieCd) return [];
  const rows = await db.manualTrailer
    .findMany({ where: { movieCd }, orderBy: { createdAt: "desc" } })
    .catch(() => []); // 표가 아직 없을 때(마이그레이션 전)
  return rows.map((r) => ({
    key: r.videoKey,
    type: TRAILER_TYPES.includes(r.type) ? r.type : "Trailer",
    lang: "ko",
    publishedAt: r.createdAt.toISOString(),
    channelChecked: true,
    channelName: r.channelName,
    channelKey: r.channelKey,
    embeddable: true,
  }));
}

async function getTrailerDataUncached(tmdbId: string | null, movieCd: string | null = null): Promise<TrailerData> {
  const empty: TrailerData = { trailers: [], candidates: [] };
  const validTmdb = tmdbId !== null && /^\d{1,12}$/.test(tmdbId);
  try {
    const [manual, fromTmdb] = await Promise.all([
      loadManualVideos(movieCd),
      validTmdb ? loadCandidates(tmdbId) : Promise.resolve([] as CachedVideo[]),
    ]);
    const manualKeys = new Set(manual.map((v) => v.key));
    const videos = [...manual, ...fromTmdb.filter((v) => !manualKeys.has(v.key))];
    if (videos.length === 0) return empty;
    const [blocked, rules] = await Promise.all([
      db.blockedVideoKey
        .findMany({ where: { videoKey: { in: videos.map((v) => v.key) } }, select: { videoKey: true } })
        .catch(() => []),
      loadChannelRules(videos.map((v) => v.channelKey).filter((k): k is string => k !== null)),
    ]);
    const blockedKeys = new Set(blocked.map((b) => b.videoKey));

    const statusOf = (v: CachedVideo): TrailerCandidateStatus => {
      if (blockedKeys.has(v.key)) return "video-blocked";
      if (v.embeddable === false) return "unavailable";
      if (!v.channelChecked) return "unverified";
      return judgeChannel(v.channelName, v.channelKey, rules);
    };
    const statuses = videos.map(statusOf);
    const trailers = labelTrailers(videos.filter((_, i) => statuses[i] === "official").slice(0, MAX_TRAILERS));
    const candidates = videos.map((v, i) => ({
      key: v.key,
      label: baseLabel(v),
      channelName: v.channelName,
      channelKey: v.channelKey,
      status: statuses[i],
      manual: manualKeys.has(v.key),
    }));
    return { trailers, candidates };
  } catch (error) {
    console.warn("[trailers] 예고편 조회 실패:", error);
    return empty;
  }
}

export const getTrailerData = cache(getTrailerDataUncached);
