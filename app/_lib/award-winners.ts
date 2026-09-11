// Wikidata 수상작 + TMDB/KMDb 포스터를 합쳐 화면 카드(RowMovie)로 변환하는 서버 유틸리티.

import {
  fetchLatestAcademyWinners,
  fetchLatestCannesWinners,
  fetchLatestBerlinWinners,
  fetchLatestVeniceWinners,
  type FestivalWinner,
} from "./wikidata";
import { searchTmdbMovie, getTmdbMoviePosterById, searchTmdbMoviePosterLoose } from "./tmdb";
import { searchKmdbMovie } from "./kmdb";
import type { RowMovie } from "./movie-rows";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

async function getPosterUrl(winner: FestivalWinner): Promise<string | null> {
  // 1) Wikidata P4947 TMDB ID — 가장 정확, 텍스트 검색 불필요
  if (winner.tmdbId) {
    const poster = await getTmdbMoviePosterById(winner.tmdbId);
    if (poster) return poster;
  }

  const displayTitle = winner.titleKo ?? winner.titleEn;
  const yearHint = String(winner.ceremonyYear - 1);

  // 2) 제목 exact match 검색 (ko-KR → en-US 순)
  const tmdb = await searchTmdbMovie(displayTitle, yearHint, winner.titleEn);
  if (tmdb?.posterUrl) return tmdb.posterUrl;

  // 3) 느슨한 매칭 — 유럽·비영어권 아트하우스 영화는 TMDB 한글 표기가
  //    Wikidata 레이블과 달라 exact match가 실패하는 경우가 많다.
  //    영어 레이블 + 연도 필터로 TMDB 첫 결과를 채택한다.
  if (winner.titleEn) {
    const loose = await searchTmdbMoviePosterLoose(winner.titleEn, winner.ceremonyYear);
    if (loose) return loose;
  }

  // 4) KMDb 폴백 (국내 영화 위주)
  const kmdb = await searchKmdbMovie(displayTitle, yearHint, { titleEn: winner.titleEn });
  return kmdb?.posterUrl ?? null;
}

async function winnersToRows(winners: FestivalWinner[]): Promise<AwardMovieRow[]> {
  // 같은 영화가 여러 부문에 오를 수 있어 중복 포스터 요청을 방지하기 위해 캐시한다.
  const posterCache = new Map<string, string | null>();

  const results: AwardMovieRow[] = [];
  for (const winner of winners) {
    const cacheKey = winner.filmQid; // QID 기준으로 캐시 — 제목이 다른 표기여도 같은 영화
    let posterUrl: string | null;
    if (posterCache.has(cacheKey)) {
      posterUrl = posterCache.get(cacheKey)!;
    } else {
      posterUrl = await getPosterUrl(winner);
      posterCache.set(cacheKey, posterUrl);
    }

    results.push({
      categoryLabel: winner.categoryLabel,
      movie: {
        id: `wikidata-${winner.filmQid}`,
        title: winner.titleKo ?? winner.titleEn,
        posterUrl,
        gradient: FALLBACK_GRADIENT,
        isNowShowing: false,
        badge: `${winner.categoryLabel} · ${winner.ceremonyYear}`,
      },
    });
  }
  return results;
}

export type AwardMovieRow = {
  categoryLabel: string;
  movie: RowMovie;
};

export async function getLatestAcademyWinnerRows(): Promise<AwardMovieRow[]> {
  const winners = await fetchLatestAcademyWinners();
  return winnersToRows(winners);
}

export async function getLatestCannesWinnerRows(): Promise<AwardMovieRow[]> {
  const winners = await fetchLatestCannesWinners();
  return winnersToRows(winners);
}

export async function getLatestBerlinWinnerRows(): Promise<AwardMovieRow[]> {
  const winners = await fetchLatestBerlinWinners();
  return winnersToRows(winners);
}

export async function getLatestVeniceWinnerRows(): Promise<AwardMovieRow[]> {
  const winners = await fetchLatestVeniceWinners();
  return winnersToRows(winners);
}
