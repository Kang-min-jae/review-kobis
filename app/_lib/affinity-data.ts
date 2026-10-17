// 추천도 계산에 필요한 DB 재료를 읽는다 — /api/affinity, /api/recommendations,
// /api/recommendations/series가 같은 함수로 같은 재료를 읽어야 같은 영화에 같은 추천도가 나온다.
// (예전엔 추천 행은 한줄평 평균, 다른 행은 CategoryRating 평균을 품질 점수로 써서, 같은
// 영화인데도 행마다 추천 %가 달랐다.)

import { db } from "./db";
import { Prisma } from "../generated/prisma/client";
import { splitGenres } from "./movie-rows";
import { canonicalGenres } from "./genre-canon";
import {
  CATEGORY_KEYS,
  isSeriesCd,
  movieIdToCd,
  type CategoryRatingInput,
  type RatingInput,
} from "./rating-input";
import {
  affinityPercent,
  buildAffinityContext,
  buildCategoryWeights,
  calculateCategoryBoost,
  calculateMovieAffinity,
  computeBayesianQuality,
  recencyWeight,
  type AffinityContext,
  type RatedMovieForContext,
} from "./calculateAffinity";
import type { CfScorer } from "./cf-data";

export type TasteMeta = {
  genres: string[]; // 대표 장르
  directorName: string | null;
  castNames: string[]; // 상위 5명
  tmdbId: string | null; // 영화의 TMDB id (시리즈는 id 체계가 달라 null)
};

export type QualityStats = {
  overallAvg: number | null; // 사이트 "전체" 평균 (사용자당 1표 — 한줄평 우선, 없으면 장문평 환산)
  overallCount: number;
  categoryStats: Record<string, { avg: number; count: number }>; // 연출·연기·각본·음악·편집
};

function parseCastNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const person of raw) {
    // 출연진 JSON의 {name, …} 항목, 또는 CAST_NAMES_SQL로 뽑은 이름 문자열
    const name = typeof person === "string" ? person : person && typeof person === "object" ? (person as { name?: unknown }).name : null;
    if (typeof name === "string" && name.trim()) names.push(name.trim());
    if (names.length >= 5) break;
  }
  return names;
}

// castNames: 출연진 JSON 대신 이름만 미리 뽑아 둔 값(CAST_NAMES_SQL) — 있으면 그걸 쓴다.
export function toTasteMeta(row: { genreAlt: string | null; directorName?: string | null; cast?: unknown; castNames?: unknown; tmdbId?: string | null }): TasteMeta {
  return {
    genres: canonicalGenres(splitGenres(row.genreAlt)),
    directorName: row.directorName?.trim() || null,
    castNames: parseCastNames(row.castNames !== undefined ? row.castNames : row.cast),
    tmdbId: row.tmdbId ?? null,
  };
}

// 취향 계산엔 출연진 앞쪽 5명의 이름만 쓰는데, 출연진 JSON은 수십 명의 이름·KMDb·TMDB 코드를
// 담고 있어 영화 한 편에 수 KB다. DB 안에서 앞쪽 10명의 이름만 잘라 받는다(이름이 빈 항목을
// 건너뛰고도 5명이 남도록 넉넉히). 결과는 이름 문자열 배열이다.
export const CAST_NAMES_SQL = Prisma.sql`CASE WHEN jsonb_typeof("cast") = 'array'
  THEN jsonb_path_query_array("cast", '$[0 to 9].name') ELSE '[]'::jsonb END`;

// movieCd 목록 → 출연진 앞쪽 이름(취향 계산용). 영화 정보 행은 출연진 없이 따로 읽은 경우에 쓴다.
export async function loadCastNames(movieCds: string[]): Promise<Map<string, unknown>> {
  const unique = [...new Set(movieCds)].filter((cd) => !isSeriesCd(cd));
  if (unique.length === 0) return new Map();
  const rows = await db.$queryRaw<{ movieCd: string; castNames: unknown }[]>`
    SELECT "movieCd", ${CAST_NAMES_SQL} AS "castNames" FROM "CachedMovie" WHERE "movieCd" = ANY(${unique}::text[])
  `;
  return new Map(rows.map((r) => [r.movieCd, r.castNames]));
}

// movieCd 목록 → 취향 계산용 메타. 영화는 CachedMovie, 시리즈(tmdb-tv-*)는 CachedSeries에서 읽는다.
export async function loadTasteMetas(movieCds: string[]): Promise<Map<string, TasteMeta>> {
  const unique = [...new Set(movieCds)];
  const seriesIds = unique.filter(isSeriesCd).map((cd) => cd.slice("tmdb-tv-".length));
  const movieOnly = unique.filter((cd) => !isSeriesCd(cd));
  const [movies, series] = await Promise.all([
    movieOnly.length > 0
      ? db.cachedMovie.findMany({
          where: { movieCd: { in: movieOnly } },
          select: { movieCd: true, genreAlt: true, directorName: true, tmdbId: true },
        })
      : [],
    seriesIds.length > 0
      ? db.cachedSeries.findMany({ where: { tmdbId: { in: seriesIds } }, select: { tmdbId: true, genreAlt: true } })
      : [],
  ]);
  const castNames = await loadCastNames(movies.map((m) => m.movieCd));
  const result = new Map<string, TasteMeta>();
  for (const m of movies) result.set(m.movieCd, toTasteMeta({ ...m, castNames: castNames.get(m.movieCd) ?? [] }));
  for (const s of series) result.set(`tmdb-tv-${s.tmdbId}`, toTasteMeta({ genreAlt: s.genreAlt }));
  return result;
}

// movieCd 목록 → 사이트 평점 집계. 한줄평·장문평이 모두 동기화되는 CategoryRating을 쓴다.
export async function loadQualityStats(movieCds: string[]): Promise<Map<string, QualityStats>> {
  const unique = [...new Set(movieCds)];
  const result = new Map<string, QualityStats>();
  if (unique.length === 0) return result;
  const groups = await db.categoryRating.groupBy({
    by: ["movieCd", "category"],
    where: { movieCd: { in: unique }, category: { in: ["전체", ...CATEGORY_KEYS] } },
    _avg: { score: true },
    _count: { _all: true },
  });
  for (const g of groups) {
    if (g._avg.score === null) continue;
    let entry = result.get(g.movieCd);
    if (!entry) {
      entry = { overallAvg: null, overallCount: 0, categoryStats: {} };
      result.set(g.movieCd, entry);
    }
    if (g.category === "전체") {
      entry.overallAvg = g._avg.score;
      entry.overallCount = g._count._all;
    } else {
      entry.categoryStats[g.category] = { avg: g._avg.score, count: g._count._all };
    }
  }
  return result;
}

export type TasteContext = {
  ctx: AffinityContext;
  ratedCds: Set<string>; // 내가 평가한 작품의 DB 키 — 추천·추천도 대상에서 뺀다
  ratedTmdbIds: Set<string>; // 같은 영화가 KOBIS·TMDB 두 항목으로 저장된 경우까지 거르기 위한 TMDB id
  ratedMetas: Map<string, TasteMeta>;
};

export async function buildTasteContext(
  ratings: RatingInput[],
  categoryRatings: CategoryRatingInput[],
): Promise<TasteContext> {
  const cdOf = new Map<string, string>();
  for (const r of ratings) {
    const cd = movieIdToCd(r.movieId);
    if (cd) cdOf.set(r.movieId, cd);
  }
  return buildTasteContextFromMetas(ratings, categoryRatings, await loadTasteMetas([...cdOf.values()]));
}

// buildTasteContext의 DB 없는 부분 — 메타를 이미 갖고 있을 때(오프라인 검증 scripts/cf-eval.mts) 그대로 쓴다.
export function buildTasteContextFromMetas(
  ratings: RatingInput[],
  categoryRatings: CategoryRatingInput[],
  ratedMetas: Map<string, TasteMeta>,
): TasteContext {
  const cdOf = new Map<string, string>();
  for (const r of ratings) {
    const cd = movieIdToCd(r.movieId);
    if (cd) cdOf.set(r.movieId, cd);
  }

  const ratedCds = new Set<string>();
  const ratedTmdbIds = new Set<string>();
  const rated: RatedMovieForContext[] = [];
  for (const r of ratings) {
    const cd = cdOf.get(r.movieId);
    if (!cd) continue;
    ratedCds.add(cd);
    const tmdbMovie = /^tmdb-(\d+)$/.exec(cd);
    if (tmdbMovie) ratedTmdbIds.add(tmdbMovie[1]);
    const meta = ratedMetas.get(cd);
    if (!meta) continue;
    if (meta.tmdbId) ratedTmdbIds.add(meta.tmdbId);
    rated.push({
      rating: r.rating,
      weight: recencyWeight(r.ratedAt, ratings.length),
      genres: meta.genres,
      directorName: meta.directorName,
      castNames: meta.castNames,
    });
  }

  return {
    ctx: buildAffinityContext(rated, buildCategoryWeights(ratings, categoryRatings)),
    ratedCds,
    ratedTmdbIds,
    ratedMetas,
  };
}

// 대상 작품 하나의 content 추천도(0~1, 협업 필터링을 섞기 전 = 점수 A). 취향 기록이 없거나(콜드 스타트)
// 작품 정보가 전혀 없으면 null — 근거 없는 숫자(모든 영화에 똑같이 붙는 "추천 65%")를 보여주지 않는다.
export function contentAffinityRaw(
  meta: TasteMeta | undefined,
  ctx: AffinityContext,
  quality: QualityStats | undefined,
): number | null {
  if (!ctx.hasData || !meta) return null;
  if (meta.genres.length === 0 && !meta.directorName && meta.castNames.length === 0) return null;
  return calculateMovieAffinity(
    meta,
    ctx,
    computeBayesianQuality(quality?.overallAvg ?? null, quality?.overallCount ?? 0),
    calculateCategoryBoost(ctx.categoryWeights, quality?.categoryStats ?? {}),
  );
}

// 대상 작품 하나의 추천도(1~99).
export function scoreAffinity(
  meta: TasteMeta | undefined,
  ctx: AffinityContext,
  quality: QualityStats | undefined,
): number | null {
  const raw = contentAffinityRaw(meta, ctx, quality);
  return raw === null ? null : affinityPercent(raw);
}

// 협업 필터링(cf-data.ts)까지 섞은 추천도. scorer가 없거나(CF 꺼짐) 이 영화에 CF 근거가 없으면
// scoreAffinity와 같은 값이고 cfBlended = false. 근거 없는 영화에 CF만으로 점수를 만들지는 않는다.
export function scoreAffinityWithCf(
  meta: TasteMeta | undefined,
  ctx: AffinityContext,
  quality: QualityStats | undefined,
  cd: string,
  scorer: CfScorer | null,
): { score: number; cfBlended: boolean } | null {
  const raw = contentAffinityRaw(meta, ctx, quality);
  if (raw === null) return null;
  if (!scorer) return { score: affinityPercent(raw), cfBlended: false };
  const blended = scorer.blend(cd, raw);
  return { score: affinityPercent(blended.raw), cfBlended: blended.alpha > 0 };
}
