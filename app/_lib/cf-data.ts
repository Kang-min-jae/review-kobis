// 협업 필터링(CF) 요청 시 처리 — "추천 N%"(content 점수 A)에 CF 점수 B를 섞는다(서버 전용).
//
// 기본 상태(CF_ENABLED 미설정)에선 DB를 전혀 읽지 않고 null을 돌려줘서, 호출하는 쪽은 예전과 완전히 같다.
// 켜져 있어도 야간 크론이 저장한 통계(CfStats)가 기준 미만이면, 또는 내 평점이 CF_MIN_USER_RATINGS개
// 미만이면 마찬가지로 null이다.
//
// 캐시: 전역 통계와 영화별 이웃 목록(집계값뿐, 회원 정보 없음)을 서버 메모리에 10분 보관한다. 회원마다
// 다른 부분(내 평점과 이웃을 곱하는 계산)은 DB 없이 메모리에서만 하므로 따로 저장하지 않는다.
// 다른 회원의 개별 평점·닉네임은 읽지도 돌려주지도 않는다.

import { db } from "./db";
import { CF_CACHE_TTL_MS, getCfConfig } from "./cf-config";
import {
  blendScores,
  computeAlpha,
  isCfGateOpen,
  meanOf,
  predictCf,
  type CfConfig,
  type CfGlobalStats,
  type CfNeighbor,
} from "./cf-core";
import { isSeriesCd, movieIdToCd, type RatingInput } from "./rating-input";
import { CF_STATS_ID } from "./cf-similarity-compute";

let statsCache: { value: CfGlobalStats | null; expiresAt: number } | null = null;

async function readStoredStats(): Promise<CfGlobalStats | null> {
  if (statsCache && statsCache.expiresAt > Date.now()) return statsCache.value;
  let value: CfGlobalStats | null = null;
  try {
    const row = await db.cfStats.findUnique({
      where: { id: CF_STATS_ID },
      select: { totalRatings: true, ratingUsers: true },
    });
    value = row ?? null;
  } catch (error) {
    // 마이그레이션 적용 전 등 — 통계가 없으면 꺼짐으로 본다.
    console.warn("[cf] 전역 통계를 읽지 못해 CF를 끕니다:", error instanceof Error ? error.message : error);
  }
  statsCache = { value, expiresAt: Date.now() + CF_CACHE_TTL_MS };
  return value;
}

export async function getCfGate(config: CfConfig = getCfConfig()): Promise<boolean> {
  if (!config.enabled) return false;
  return isCfGateOpen(config, await readStoredStats());
}

const NEIGHBOR_CACHE_MAX = 5000;
const neighborCache = new Map<string, { neighbors: CfNeighbor[]; expiresAt: number }>();

async function loadNeighbors(cds: string[]): Promise<Map<string, CfNeighbor[]>> {
  const now = Date.now();
  const result = new Map<string, CfNeighbor[]>();
  const missing: string[] = [];
  for (const cd of new Set(cds)) {
    const hit = neighborCache.get(cd);
    if (hit && hit.expiresAt > now) result.set(cd, hit.neighbors);
    else missing.push(cd);
  }
  if (missing.length > 0) {
    const rows = await db.movieCfSimilarity.findMany({
      where: { movieCd: { in: missing } },
      select: { movieCd: true, neighborCd: true, similarity: true, coRaters: true },
      orderBy: [{ movieCd: "asc" }, { similarity: "desc" }],
    });
    const grouped = new Map<string, CfNeighbor[]>(missing.map((cd) => [cd, []]));
    for (const r of rows) grouped.get(r.movieCd)?.push({ cd: r.neighborCd, sim: r.similarity, coRaters: r.coRaters });
    for (const [cd, neighbors] of grouped) {
      if (neighborCache.size >= NEIGHBOR_CACHE_MAX) {
        const oldest = neighborCache.keys().next().value;
        if (oldest !== undefined) neighborCache.delete(oldest);
      }
      neighborCache.set(cd, { neighbors, expiresAt: now + CF_CACHE_TTL_MS });
      result.set(cd, neighbors);
    }
  }
  return result;
}

export type CfBlend = { raw: number; alpha: number };

export type CfScorer = {
  // 점수를 매길 영화들의 이웃 목록을 미리 읽는다(한 번의 DB 조회, 캐시 우선).
  prefetch(cds: string[]): Promise<void>;
  // content 점수 A(0~1)에 CF를 섞은 값. B가 없거나 α = 0이면 A 그대로.
  blend(cd: string, contentRaw: number): CfBlend;
};

// CF를 쓸 수 없으면 null — 호출하는 쪽은 기존 점수를 그대로 쓴다.
export async function createCfScorer(myRatings: RatingInput[]): Promise<CfScorer | null> {
  const config = getCfConfig();
  if (!config.enabled) return null;

  // 유사도는 영화만 계산한다(시리즈 제외) — 내 평균·평점 수도 같은 기준으로 센다.
  const mine = new Map<string, number>();
  for (const r of myRatings) {
    const cd = movieIdToCd(r.movieId);
    if (cd && !isSeriesCd(cd)) mine.set(cd, r.rating);
  }
  if (mine.size < config.minUserRatings) return null;
  if (!(await getCfGate(config))) return null;

  const myMean = meanOf([...mine.values()])!;
  const neighbors = new Map<string, CfNeighbor[]>();

  return {
    async prefetch(cds) {
      const wanted = cds.filter((cd) => !isSeriesCd(cd) && !neighbors.has(cd));
      if (wanted.length === 0) return;
      try {
        for (const [cd, list] of await loadNeighbors(wanted)) neighbors.set(cd, list);
      } catch (error) {
        console.warn("[cf] 이웃 목록을 읽지 못했습니다(CF 미적용):", error instanceof Error ? error.message : error);
      }
    },
    blend(cd, contentRaw) {
      const predicted = predictCf(mine, myMean, neighbors.get(cd), config);
      const alpha = computeAlpha(config, {
        gateOpen: true,
        myRatingCount: mine.size,
        neighborCount: predicted?.neighborCount ?? 0,
        hasCfScore: predicted !== null,
      });
      return { raw: blendScores(contentRaw, predicted?.score ?? null, alpha), alpha };
    },
  };
}
