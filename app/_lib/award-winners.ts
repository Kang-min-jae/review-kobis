// Wikidata 수상작 + TMDB 포스터를 합쳐 화면 카드(RowMovie)로 변환하는 서버 유틸리티.
// Wikidata → 최신 수상작 제목/연도, TMDB → 포스터 URL.

import { fetchLatestAcademyWinners, fetchLatestCannesWinners, type FestivalWinner } from "./wikidata";
import { searchTmdbMovie } from "./tmdb";
import type { RowMovie } from "./movie-rows";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

async function winnerToRowMovie(winner: FestivalWinner): Promise<RowMovie | null> {
  const displayTitle = winner.titleKo ?? winner.titleEn;

  const tmdb = await searchTmdbMovie(
    displayTitle,
    String(winner.ceremonyYear - 1), // 시상식은 전년도 작품을 수상하는 경우가 많다
    winner.titleEn
  );

  // 포스터를 못 찾아도 카드를 보여준다(그라디언트 배경으로 대체).
  return {
    id: `wikidata-${winner.filmQid}`,
    title: displayTitle,
    posterUrl: tmdb?.posterUrl ?? null,
    gradient: FALLBACK_GRADIENT,
    isNowShowing: false,
    badge: `${winner.categoryLabel} · ${winner.ceremonyYear}`,
  };
}

export type AwardMovieRow = {
  categoryLabel: string;
  movie: RowMovie;
};

async function winnersToRows(winners: FestivalWinner[]): Promise<AwardMovieRow[]> {
  // 같은 영화가 여러 부문에 오를 수 있어 중복 포스터 요청을 피하기 위해
  // 제목 기준으로 TMDB 조회 결과를 재사용한다.
  const posterCache = new Map<string, string | null>();

  const results: AwardMovieRow[] = [];
  for (const winner of winners) {
    const cacheKey = winner.titleEn.toLowerCase();
    let posterUrl: string | null;
    if (posterCache.has(cacheKey)) {
      posterUrl = posterCache.get(cacheKey)!;
    } else {
      const tmdb = await searchTmdbMovie(
        winner.titleKo ?? winner.titleEn,
        String(winner.ceremonyYear - 1),
        winner.titleEn
      );
      posterUrl = tmdb?.posterUrl ?? null;
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

export async function getLatestAcademyWinnerRows(): Promise<AwardMovieRow[]> {
  const winners = await fetchLatestAcademyWinners();
  return winnersToRows(winners);
}

export async function getLatestCannesWinnerRows(): Promise<AwardMovieRow[]> {
  const winners = await fetchLatestCannesWinners();
  return winnersToRows(winners);
}
