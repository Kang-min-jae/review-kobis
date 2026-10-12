// 영화 상세 페이지 "공식 예고편 확인하기" — TMDB에 등록된 공식 YouTube 예고편만 보여준다.
//
// 1) TMDB /movie/{id}/videos를 ko-KR, en-US로 각각 받아 key 기준으로 합친다(서버에서만 호출 —
//    API 키는 브라우저로 나가지 않는다).
// 2) site === "YouTube" && official === true && type이 TRAILER_TYPES에 있는 것만 남긴다.
// 3) 한국어 영상 먼저 → Trailer가 Teaser보다 먼저 → 최신 공개일 순으로 정렬한다.
// 4) 영화마다 24시간 DB에 캐시한다(TrailerCache). TMDB 호출이 실패하면 마지막으로 성공한
//    결과를 쓰고, 그것도 없으면 "영상 없음"으로 처리한다 — 어떤 경우에도 페이지는 오류가 나지 않는다.
// 5) 관리자가 막은 영상(BlockedVideoKey)은 캐시와 상관없이 매번 걸러서, 막는 즉시 사라진다.

import { cache } from "react";
import { db } from "./db";
import { getTmdbMovieVideos, type RawTmdbVideo } from "./tmdb";

// 보여줄 영상 유형. 클립까지 보여주려면 "Clip"을 추가하면 된다(라벨은 TYPE_LABELS에 이미 있음).
export const TRAILER_TYPES: readonly string[] = ["Trailer", "Teaser"];
export const MAX_TRAILERS = 3;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const TYPE_LABELS: Record<string, string> = {
  Trailer: "메인 예고편",
  Teaser: "티저",
  Clip: "클립",
};

// 캐시에 저장하는 형태(차단 필터 전, 정렬까지 끝난 후보 목록).
type CachedVideo = {
  key: string;
  type: string;
  lang: string; // iso_639_1 ("ko" | "en" | …)
  publishedAt: string | null;
};

export type OfficialTrailer = {
  key: string;
  label: string; // "메인 예고편", "티저 · 영어", "메인 예고편 2" …
};

function isCachedVideo(v: unknown): v is CachedVideo {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.key === "string" && typeof o.type === "string" && typeof o.lang === "string";
}

// YouTube 영상 ID 형식(영문·숫자·-·_ 11자 안팎)만 받는다 — 임베드 URL에 그대로 들어가기 때문.
const YOUTUBE_KEY_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

export function pickOfficialVideos(lists: RawTmdbVideo[][]): CachedVideo[] {
  const byKey = new Map<string, CachedVideo>();
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

export function labelTrailers(videos: CachedVideo[]): OfficialTrailer[] {
  const base = videos.map((v) => {
    const typeLabel = TYPE_LABELS[v.type] ?? "예고편";
    return v.lang === "ko" ? typeLabel : v.lang === "en" ? `${typeLabel} · 영어` : `${typeLabel} · 해외`;
  });
  // 같은 라벨이 여러 개면 두 번째부터 번호를 붙여 구분한다("메인 예고편", "메인 예고편 2").
  const seen = new Map<string, number>();
  return videos.map((v, i) => {
    const n = (seen.get(base[i]) ?? 0) + 1;
    seen.set(base[i], n);
    return { key: v.key, label: n === 1 ? base[i] : `${base[i]} ${n}` };
  });
}

async function fetchFromTmdb(tmdbId: string): Promise<CachedVideo[] | null> {
  const [ko, en] = await Promise.all([getTmdbMovieVideos(tmdbId, "ko-KR"), getTmdbMovieVideos(tmdbId, "en-US")]);
  if (ko === null && en === null) return null; // 둘 다 실패(키 없음·네트워크 오류)
  return pickOfficialVideos([ko ?? [], en ?? []]).slice(0, 10);
}

async function loadCandidates(tmdbId: string): Promise<CachedVideo[]> {
  const cached = await db.trailerCache.findUnique({ where: { tmdbId } }).catch(() => null);
  const cachedVideos = cached && Array.isArray(cached.videos) ? (cached.videos as unknown[]).filter(isCachedVideo) : null;
  if (cached && cachedVideos && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) return cachedVideos;

  const fresh = await fetchFromTmdb(tmdbId).catch(() => null);
  if (fresh === null) return cachedVideos ?? []; // TMDB 실패 → 마지막 성공 결과(없으면 영상 없음)

  await db.trailerCache
    .upsert({
      where: { tmdbId },
      create: { tmdbId, videos: fresh, fetchedAt: new Date() },
      update: { videos: fresh, fetchedAt: new Date() },
    })
    .catch(() => null);
  return fresh;
}

async function getOfficialTrailersUncached(tmdbId: string | null): Promise<OfficialTrailer[]> {
  if (!tmdbId || !/^\d{1,12}$/.test(tmdbId)) return [];
  try {
    const candidates = await loadCandidates(tmdbId);
    if (candidates.length === 0) return [];
    const blocked = await db.blockedVideoKey
      .findMany({ where: { videoKey: { in: candidates.map((v) => v.key) } }, select: { videoKey: true } })
      .catch(() => []);
    const blockedKeys = new Set(blocked.map((b) => b.videoKey));
    return labelTrailers(candidates.filter((v) => !blockedKeys.has(v.key)).slice(0, MAX_TRAILERS));
  } catch (error) {
    console.warn("[trailers] 예고편 조회 실패:", error);
    return [];
  }
}

export const getOfficialTrailers = cache(getOfficialTrailersUncached);
