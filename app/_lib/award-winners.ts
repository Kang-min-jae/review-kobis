// Wikidata 수상작 + TMDB/KMDb 포스터를 합쳐 화면 카드(RowMovie)로 변환하는 서버 유틸리티.

import {
  fetchLatestAcademyWinners,
  fetchLatestCannesWinners,
  fetchLatestBerlinWinners,
  fetchLatestVeniceWinners,
  type FestivalWinner,
  type FestivalType,
} from "./wikidata";
import { searchTmdbMovie, getTmdbMoviePosterById, searchTmdbMoviePosterLoose } from "./tmdb";
import { searchKmdbMovie } from "./kmdb";
import { db } from "./db";
import type { RowMovie } from "./movie-rows";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

// 포스터 검색 5단계 폴백.
// 각 단계 실패 시 콘솔에 로그를 남겨 어느 단계에서 실패하는지 추적 가능.
async function getPosterUrl(winner: FestivalWinner, festival: FestivalType): Promise<string | null> {
  const ctx = `[award-tmdb][${festival}] "${winner.titleKo ?? winner.titleEn}" (${winner.ceremonyYear}) [${winner.categoryLabel}]`;

  // 1) Wikidata P4947 TMDB ID 직접 조회 — 가장 정확
  if (winner.tmdbId) {
    const poster = await getTmdbMoviePosterById(winner.tmdbId);
    if (poster) return poster;
    console.warn(`${ctx} P4947 tmdbId=${winner.tmdbId} 포스터 null`);
  }

  const displayTitle = winner.titleKo ?? winner.titleEn;
  const yearHint = String(winner.ceremonyYear - 1);

  // 2) 제목 exact match: ko-KR → en-US
  const tmdb = await searchTmdbMovie(displayTitle, yearHint, winner.titleEn);
  if (tmdb?.posterUrl) return tmdb.posterUrl;
  console.warn(`${ctx} exact match 실패 (displayTitle="${displayTitle}", titleEn="${winner.titleEn}")`);

  // 3) 느슨한 매칭: en 제목 + primary_release_year (연도 ±2 순차 시도)
  //    유럽·비영어권 아트하우스 영화는 TMDB 한글 표기가 Wikidata 레이블과
  //    달라 exact match가 항상 실패하는 경우가 있다.
  if (winner.titleEn) {
    const loose = await searchTmdbMoviePosterLoose(winner.titleEn, winner.ceremonyYear);
    if (loose) return loose;
    console.warn(`${ctx} loose(en) 실패`);
  }

  // 4) 느슨한 매칭: ko 제목 + 연도 (한국어 제목 있을 때 추가 시도)
  if (winner.titleKo && winner.titleKo !== displayTitle) {
    const looseKo = await searchTmdbMoviePosterLoose(winner.titleKo, winner.ceremonyYear);
    if (looseKo) return looseKo;
    console.warn(`${ctx} loose(ko) 실패`);
  }

  // 5) KMDb 폴백 — 한국 개봉 영화 위주
  const kmdb = await searchKmdbMovie(displayTitle, yearHint, { titleEn: winner.titleEn });
  if (kmdb?.posterUrl) return kmdb.posterUrl;

  console.warn(`${ctx} 모든 단계 실패 — 포스터 없음`);
  return null;
}

async function winnersToRows(winners: FestivalWinner[], festival: FestivalType): Promise<AwardMovieRow[]> {
  // 같은 영화가 여러 부문에 오를 수 있다 — 포스터 중복 요청 방지와
  // React key 중복(wikidata-Q...) 방지를 위해 filmQid 기준으로 첫 번째 부문만 남긴다.
  const seenQids = new Set<string>();
  const posterCache = new Map<string, string | null>();

  const results: AwardMovieRow[] = [];
  for (const winner of winners) {
    if (seenQids.has(winner.filmQid)) continue;
    seenQids.add(winner.filmQid);

    let posterUrl: string | null;
    if (posterCache.has(winner.filmQid)) {
      posterUrl = posterCache.get(winner.filmQid)!;
    } else {
      posterUrl = await getPosterUrl(winner, festival);
      posterCache.set(winner.filmQid, posterUrl);
    }

    // 평점 페이지가 영화 정보(제목·포스터)를 조회할 수 있도록 CachedMovie에 미리 저장.
    // movieCd로 wikidata ID를 그대로 쓴다 — KOBIS 코드가 없는 해외 수상작 전용.
    try {
      await db.cachedMovie.upsert({
        where: { movieCd: `wikidata-${winner.filmQid}` },
        update: {
          title: winner.titleKo ?? winner.titleEn ?? "",
          titleEn: winner.titleEn ?? null,
          posterUrl,
          tmdbId: winner.tmdbId ?? null,
        },
        create: {
          movieCd: `wikidata-${winner.filmQid}`,
          title: winner.titleKo ?? winner.titleEn ?? "",
          titleEn: winner.titleEn ?? null,
          posterUrl,
          tmdbId: winner.tmdbId ?? null,
          cast: [],
          source: "tmdb",
        },
      });
    } catch {
      // DB 오류는 무시 — 포스터·목록은 정상 표시됨
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
  return winnersToRows(winners, "academy");
}

export async function getLatestCannesWinnerRows(): Promise<AwardMovieRow[]> {
  const winners = await fetchLatestCannesWinners();
  return winnersToRows(winners, "cannes");
}

export async function getLatestBerlinWinnerRows(): Promise<AwardMovieRow[]> {
  const winners = await fetchLatestBerlinWinners();
  return winnersToRows(winners, "berlin");
}

export async function getLatestVeniceWinnerRows(): Promise<AwardMovieRow[]> {
  const winners = await fetchLatestVeniceWinners();
  return winnersToRows(winners, "venice");
}
