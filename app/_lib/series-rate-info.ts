// TV 시리즈 평점 페이지에 필요한 정보를 조회·캐시하는 유틸리티.
// 영화(movie-rate-info.ts)의 CachedMovie ↔ TMDB+KMDb+KOBIS 패턴에 대응하지만
// 시리즈는 TMDB 단일 소스다.
//
// ID 형식: "tmdb-tv-{tmdbId}" (예: "tmdb-tv-128064")
// 리뷰·평점 DB의 movieCd 키로도 이 ID를 그대로 사용한다.

import { db } from "./db";
import { getTmdbSeriesDetails } from "./tmdb";
import { splitGenres } from "./movie-rows";

const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3일
const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

export type ResolvedSeriesInfo = {
  seriesId: string; // "tmdb-tv-{tmdbId}"
  movieCd: string;  // review/rating DB 키 — seriesId와 동일
  tmdbId: string;
  title: string;
  description: string;
  posterUrl: string | null;
  gradient: string;
  firstAirDate: string | null;
  genre: string | null;
  seasonCount: number | null;
};

async function fetchAndCacheSeriesMeta(tmdbId: string): Promise<ResolvedSeriesInfo | null> {
  const details = await getTmdbSeriesDetails(tmdbId);
  if (!details) return null;

  await db.cachedSeries.upsert({
    where: { tmdbId },
    update: {
      name: details.name,
      originalName: details.originalName,
      posterUrl: details.posterUrl,
      overview: details.overview,
      firstAirDate: details.firstAirDate,
      genreAlt: details.genre,
      seasonCount: details.seasonCount,
    },
    create: {
      tmdbId,
      name: details.name,
      originalName: details.originalName,
      posterUrl: details.posterUrl,
      overview: details.overview,
      firstAirDate: details.firstAirDate,
      genreAlt: details.genre,
      seasonCount: details.seasonCount,
    },
  });

  const seriesId = `tmdb-tv-${tmdbId}`;
  return {
    seriesId,
    movieCd: seriesId,
    tmdbId,
    title: details.name,
    description: details.overview ?? "",
    posterUrl: details.posterUrl,
    gradient: FALLBACK_GRADIENT,
    firstAirDate: details.firstAirDate,
    genre: details.genre,
    seasonCount: details.seasonCount,
  };
}

export async function resolveSeriesRateInfo(id: string): Promise<ResolvedSeriesInfo | null> {
  if (!id.startsWith("tmdb-tv-")) return null;
  const tmdbId = id.slice("tmdb-tv-".length);
  if (!tmdbId) return null;

  const cached = await db.cachedSeries.findUnique({ where: { tmdbId } });
  const isStale = !cached || Date.now() - cached.updatedAt.getTime() > CACHE_TTL_MS;

  if (cached && !isStale) {
    return {
      seriesId: id,
      movieCd: id,
      tmdbId,
      title: cached.name,
      description: cached.overview ?? "",
      posterUrl: cached.posterUrl,
      gradient: FALLBACK_GRADIENT,
      firstAirDate: cached.firstAirDate,
      genre: cached.genreAlt,
      seasonCount: cached.seasonCount,
    };
  }

  return fetchAndCacheSeriesMeta(tmdbId);
}

export function seriesGenreFields(genreAlt: string | null | undefined) {
  const all = splitGenres(genreAlt);
  return { genre: all.length > 0 ? all.slice(0, 2).join(" · ") : null, allGenres: all };
}
