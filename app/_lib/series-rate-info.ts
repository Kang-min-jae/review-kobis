// TV 시리즈 평점 페이지에 필요한 정보를 조회·캐시하는 유틸리티.
// 영화(movie-rate-info.ts)의 CachedMovie ↔ TMDB+KMDb+KOBIS 패턴에 대응하지만
// 시리즈는 TMDB 단일 소스다.
//
// ID 형식: "tmdb-tv-{tmdbId}" (예: "tmdb-tv-128064")
// 리뷰·평점 DB의 movieCd 키로도 이 ID를 그대로 사용한다.

import { cache } from "react";
import { after } from "next/server";
import { db } from "./db";
import { fetchTmdbSeriesDetails } from "./tmdb";
import { splitGenres } from "./movie-rows";
import { formatPosterUrl } from "./formatPosterUrl";
import { isSeriesCd } from "./rating-input";

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

// 없는 시리즈면 null, TMDB를 잠깐 쓸 수 없으면 TmdbUnavailableError를 던진다 — 처음 보는 시리즈가 잠깐의
// 장애로 "없는 시리즈"(404)가 되어 공용 캐시에 남지 않게 한다.
async function fetchAndCacheSeriesMeta(tmdbId: string): Promise<ResolvedSeriesInfo | null> {
  const details = await fetchTmdbSeriesDetails(tmdbId);
  if (!details) return null;

  await db.cachedSeries.upsert({
    where: { tmdbId },
    select: { tmdbId: true }, // 저장만 한다 — 저장된 행 전체(JSON 포함)를 돌려받지 않는다
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

// 정보가 3일이 지나 오래됐어도 저장된 값으로 바로 그리고, TMDB 갱신은 응답을 보낸 뒤 뒤에서 한다
// (예전엔 갱신을 기다렸고, 그때 TMDB가 실패하면 저장된 정보가 있어도 404가 났다).
// generateMetadata와 페이지 본문이 같은 요청에서 함께 부르므로 요청 단위로 한 번만 계산한다.
export const resolveSeriesRateInfo = cache(resolveSeriesRateInfoUncached);

async function resolveSeriesRateInfoUncached(id: string): Promise<ResolvedSeriesInfo | null> {
  if (!isSeriesCd(id)) return null;
  const tmdbId = id.slice("tmdb-tv-".length);
  if (!tmdbId) return null;

  const cached = await db.cachedSeries.findUnique({ where: { tmdbId } });
  const isStale = !cached || Date.now() - cached.updatedAt.getTime() > CACHE_TTL_MS;

  if (cached) {
    if (isStale) {
      after(() => fetchAndCacheSeriesMeta(tmdbId).catch(() => null));
    }
    return {
      seriesId: id,
      movieCd: id,
      tmdbId,
      title: cached.name,
      description: cached.overview ?? "",
      posterUrl: formatPosterUrl(cached.posterUrl),
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
