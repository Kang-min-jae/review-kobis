// Wikidata 수상작 + TMDB/KMDb 포스터를 합쳐 화면 카드(RowMovie)로 변환하는 서버 유틸리티.

import { unstable_cache } from "next/cache";
import {
  fetchLatestAcademyWinners,
  fetchLatestCannesWinners,
  fetchLatestBerlinWinners,
  fetchLatestVeniceWinners,
  fetchMovieAwardWins,
  CACHE_VERSION,
  type FestivalWinner,
  type FestivalType,
} from "./wikidata";
import { searchTmdbMovie, getTmdbMovieDetailsById, searchTmdbMoviePosterLoose, tmdbDetailsMatch } from "./tmdb";
import { searchKmdbMovie } from "./kmdb";
import { db } from "./db";
import type { RowMovie } from "./movie-rows";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

// TMDB 조회 결과 제목이 수상작 제목(한국어/영어)과 충분히 일치하는지 검사한다.
// 특수문자·공백 제거 + 소문자 정규화 후 포함 관계를 확인한다.
// P4947(Wikidata TMDB ID)가 잘못 매핑된 경우 엉뚱한 포스터가 붙는 것을 차단한다.
function normForComp(s: string): string {
  return s.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

function posterTitleMatchesWinner(
  fetched: { title: string; originalTitle: string | null },
  winner: FestivalWinner
): boolean {
  const fetchedNorms = [
    normForComp(fetched.title),
    fetched.originalTitle ? normForComp(fetched.originalTitle) : null,
  ].filter(Boolean) as string[];

  const expectedNorms = [
    winner.titleKo ? normForComp(winner.titleKo) : null,
    winner.titleEn ? normForComp(winner.titleEn) : null,
  ].filter(Boolean) as string[];

  for (const expected of expectedNorms) {
    if (expected.length < 2) continue;
    for (const fetched of fetchedNorms) {
      if (fetched.length < 2) continue;
      // 포함 관계 — 원제/번역제 표기 차이(관사 생략 등)를 흡수한다
      if (fetched.includes(expected) || expected.includes(fetched)) return true;
    }
  }
  return false;
}

// 포스터 검색 5단계 폴백.
// 각 단계 실패 시 콘솔에 로그를 남겨 어느 단계에서 실패하는지 추적 가능.
// 수상작 개봉연도로 그럴듯한 범위 — 시상식 3년 전 ~ 1년 후 개봉작.
function plausibleForCeremony(releaseDate: string | null, ceremonyYear: number): boolean {
  const y = parseInt(releaseDate?.slice(0, 4) ?? "", 10);
  return !Number.isFinite(y) || (y >= ceremonyYear - 3 && y <= ceremonyYear + 1);
}

type PosterResult = { posterUrl: string | null; tmdbId: string | null };

// posterUrl과 함께 "검증을 통과한" TMDB ID를 돌려준다(검증 안 된 ID는 null) — 이 ID가
// 평점 페이지의 영화 정보 조회에 그대로 쓰이므로, 틀린 ID를 저장하면 다른 영화 정보가 붙는다.
async function getPosterUrl(winner: FestivalWinner, festival: FestivalType): Promise<PosterResult> {
  const ctx = `[award-tmdb][${festival}] "${winner.titleKo ?? winner.titleEn}" (${winner.ceremonyYear}) [${winner.categoryLabel}]`;

  // 1) Wikidata P4947 TMDB ID 직접 조회.
  //    제목 불일치 시 포스터 차단 — P4947 매핑 오류로 전혀 다른 영화 포스터가 붙는 것을 방지.
  if (winner.tmdbId) {
    const details = await getTmdbMovieDetailsById(winner.tmdbId, "en-US");
    if (details?.posterUrl) {
      if (posterTitleMatchesWinner(details, winner) && plausibleForCeremony(details.releaseDate, winner.ceremonyYear)) {
        return { posterUrl: details.posterUrl, tmdbId: details.tmdbId };
      }
      console.warn(
        `${ctx} P4947 tmdbId=${winner.tmdbId} 제목 불일치 차단` +
        ` — TMDB반환="${details.title}" / expected="${winner.titleEn ?? winner.titleKo}"`
      );
    } else {
      console.warn(`${ctx} P4947 tmdbId=${winner.tmdbId} 포스터 null`);
    }
  }

  const displayTitle = winner.titleKo ?? winner.titleEn;
  const yearHint = String(winner.ceremonyYear - 1);

  // 2) 제목 exact match: ko-KR → en-US
  const tmdb = await searchTmdbMovie(displayTitle, yearHint, winner.titleEn);
  if (
    tmdb?.posterUrl &&
    tmdbDetailsMatch(tmdb, [winner.titleKo, winner.titleEn], null) &&
    plausibleForCeremony(tmdb.releaseDate, winner.ceremonyYear)
  ) {
    return { posterUrl: tmdb.posterUrl, tmdbId: tmdb.tmdbId };
  }
  console.warn(`${ctx} exact match 실패 (displayTitle="${displayTitle}", titleEn="${winner.titleEn}")`);

  // 3) 느슨한 매칭: 한/영 제목 동시 검색 + 제목 유사도 검증
  //    유럽·비영어권 아트하우스 영화는 TMDB 한글 표기가 Wikidata 레이블과
  //    달라 exact match가 항상 실패하는 경우가 있다.
  if (winner.titleEn || winner.titleKo) {
    const primaryTitle = winner.titleEn ?? winner.titleKo!;
    const altTitle = winner.titleEn ? winner.titleKo : null;
    const loose = await searchTmdbMoviePosterLoose(primaryTitle, winner.ceremonyYear, altTitle);
    if (loose) return { posterUrl: loose, tmdbId: null };
    console.warn(`${ctx} loose(한/영 병렬) 실패`);
  }

  // 5) KMDb 폴백 — 한국 개봉 영화 위주
  const kmdb = await searchKmdbMovie(displayTitle, yearHint, { titleEn: winner.titleEn });
  if (kmdb?.posterUrl) return { posterUrl: kmdb.posterUrl, tmdbId: null };

  console.warn(`${ctx} 모든 단계 실패 — 포스터 없음`);
  return { posterUrl: null, tmdbId: null };
}

async function winnersToRows(winners: FestivalWinner[], festival: FestivalType): Promise<AwardMovieRow[]> {
  if (winners.length === 0) return [];

  // rowsToMap이 이미 awardQid별 최신 연도 수상작만 남기므로 추가 연도 필터 없이
  // 카테고리별 가장 최신 수상작을 전부 표시한다. Wikidata에 특정 부문의 최신 연도 데이터가
  // 아직 없어도 그 부문의 바로 직전 수상작이 빠지지 않는다.

  // 같은 영화+부문 조합만 중복 제거 — 같은 영화가 여러 부문을 수상하면 부문별로 카드를 따로 표시.
  const seenKeys = new Set<string>();
  const posterCache = new Map<string, PosterResult>();

  const results: AwardMovieRow[] = [];
  for (const winner of winners) {
    const key = `${winner.filmQid}-${winner.categoryLabel}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    let poster: PosterResult;
    if (posterCache.has(winner.filmQid)) {
      poster = posterCache.get(winner.filmQid)!;
    } else {
      poster = await getPosterUrl(winner, festival);
      posterCache.set(winner.filmQid, poster);
    }
    const { posterUrl } = poster;

    // 평점 페이지가 영화 정보(제목·포스터)를 조회할 수 있도록 CachedMovie에 미리 저장.
    // movieCd로 wikidata ID를 그대로 쓴다 — KOBIS 코드가 없는 해외 수상작 전용.
    try {
      const movieCd = `wikidata-${winner.filmQid}`;
      const existing = await db.cachedMovie.findUnique({ where: { movieCd }, select: { tmdbId: true } });
      // 연결된 TMDB 영화가 바뀌었으면 예전 영화에서 채워진 줄거리·장르 등을 비우고 평점
      // 페이지에서 다시 검증·보강하게 한다(source를 검증 전 상태로 되돌림).
      const reset = existing && existing.tmdbId !== poster.tmdbId
        ? { overview: null, releaseDate: null, runtimeMinutes: null, genreAlt: null, directorName: null, directorKmdbId: null, directorTmdbId: null, cast: [], source: "tmdb" }
        : {};
      await db.cachedMovie.upsert({
        where: { movieCd },
        select: { movieCd: true }, // 저장만 한다 — 저장된 행 전체(JSON 포함)를 돌려받지 않는다
        update: {
          title: winner.titleKo ?? winner.titleEn ?? "",
          titleEn: winner.titleEn ?? null,
          posterUrl,
          tmdbId: poster.tmdbId,
          ...reset,
        },
        create: {
          movieCd,
          title: winner.titleKo ?? winner.titleEn ?? "",
          titleEn: winner.titleEn ?? null,
          posterUrl,
          tmdbId: poster.tmdbId,
          cast: [],
          source: "tmdb",
        },
      });
    } catch {
      // DB 오류는 무시 — 포스터·목록은 정상 표시됨
    }

    results.push({
      categoryLabel: winner.categoryLabel,
      ceremonyYear: winner.ceremonyYear,
      movie: {
        id: `wikidata-${winner.filmQid}-${winner.categoryLabel}`,
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
  ceremonyYear: number;
  movie: RowMovie;
};

// 회차 번호 — 아카데미 1929년 1회, 칸 1946년 1회(1948·1950 미개최), 베를린 1951년 1회, 베니스 1932년 1회(전쟁 중 일부 미개최).
const EDITION_OFFSET: Record<FestivalType, number> = { academy: 1928, cannes: 1947, berlin: 1950, venice: 1943 };

// "제98회 · 2026년" 같은 회차 표기. 수상작이 없으면 null.
export function ceremonyLabel(festival: FestivalType, rows: AwardMovieRow[]): string | null {
  const year = rows[0]?.ceremonyYear;
  if (!year) return null;
  return `제${year - EDITION_OFFSET[festival]}회 · ${year}년`;
}

// 수상작 조회는 Wikidata + TMDB API를 여러 번 직렬 호출하므로 최초 응답이 수 초
// 걸릴 수 있다. 결과를 12시간 캐싱해 반복 요청은 즉시 반환하고 서버 부하를 낮춘다.
const AWARD_CACHE_TTL = 60 * 60 * 24 * 7; // 7일 — 관리자 도구가 바꾸면 태그로 바로 지운다

export const getLatestAcademyWinnerRows = unstable_cache(
  async (): Promise<AwardMovieRow[]> => {
    const winners = await fetchLatestAcademyWinners();
    return winnersToRows(winners, "academy");
  },
  [`award-winners-academy-${CACHE_VERSION}`],
  { revalidate: AWARD_CACHE_TTL, tags: ["award-winners"] }
);

export const getLatestCannesWinnerRows = unstable_cache(
  async (): Promise<AwardMovieRow[]> => {
    const winners = await fetchLatestCannesWinners();
    return winnersToRows(winners, "cannes");
  },
  [`award-winners-cannes-${CACHE_VERSION}`],
  { revalidate: AWARD_CACHE_TTL, tags: ["award-winners"] }
);

export const getLatestBerlinWinnerRows = unstable_cache(
  async (): Promise<AwardMovieRow[]> => {
    const winners = await fetchLatestBerlinWinners();
    return winnersToRows(winners, "berlin");
  },
  [`award-winners-berlin-${CACHE_VERSION}`],
  { revalidate: AWARD_CACHE_TTL, tags: ["award-winners"] }
);

export const getLatestVeniceWinnerRows = unstable_cache(
  async (): Promise<AwardMovieRow[]> => {
    const winners = await fetchLatestVeniceWinners();
    return winnersToRows(winners, "venice");
  },
  [`award-winners-venice-${CACHE_VERSION}`],
  { revalidate: AWARD_CACHE_TTL, tags: ["award-winners"] }
);

// ── 특정 영화의 수상 이력 조회 ────────────────────────────────────────────────

export type AwardWin = {
  festivalId: FestivalType;
  festivalName: string;
  category: string;
  year: number;
};

const FESTIVAL_NAMES: Record<FestivalType, string> = {
  academy: "아카데미 시상식",
  cannes: "칸 영화제",
  berlin: "베를린 영화제",
  venice: "베니스 영화제",
};

const FESTIVAL_ORDER: FestivalType[] = ["academy", "cannes", "berlin", "venice"];

const LATEST_WINNER_FETCHERS: Record<FestivalType, () => Promise<FestivalWinner[]>> = {
  academy: fetchLatestAcademyWinners,
  cannes: fetchLatestCannesWinners,
  berlin: fetchLatestBerlinWinners,
  venice: fetchLatestVeniceWinners,
};

// Wikidata에서 해당 영화의 수상 이력을 직접 조회한다 (연도 제한 없음).
// tmdbId로 1차 조회하고, 없으면 영문 제목으로 2차 조회한다.
// 결과는 Wikidata에 의해 부문별 중복 없이 모든 연도 수상작이 포함된다.
export async function getMovieAwardWins({
  movieId = null,
  tmdbId,
  titleKo,
  titleEn,
}: {
  movieId?: string | null;
  tmdbId: string | null;
  titleKo: string | null;
  titleEn: string | null;
}): Promise<AwardWin[]> {
  // Wikidata(자동) + 관리자가 등록한 공식 수상작(수동). 신작은 Wikidata 반영이 늦어
  // 관리자 등록분이 유일한 출처일 수 있다.
  const [entries, official, festivalLists] = await Promise.all([
    fetchMovieAwardWins(tmdbId, titleEn, titleKo),
    movieId
      ? db.officialWinner.findMany({ where: { movieId }, select: { festival: true, awardCategory: true, year: true } }).catch(() => [])
      : Promise.resolve([]),
    // 사이트가 이미 갖고 있는 영화제별 최신 수상작 목록 — 영화 단위 Wikidata 조회에
    // 수상 기록이 아직 없는 신작도 여기엔 들어 있을 수 있다.
    Promise.all(
      (["academy", "cannes", "berlin", "venice"] as const).map(async (festival) => ({
        festival,
        winners: await LATEST_WINNER_FETCHERS[festival]().catch(() => [] as FestivalWinner[]),
      })),
    ),
  ]);

  const wins: AwardWin[] = entries.map((e) => ({
    festivalId: e.festivalId,
    festivalName: FESTIVAL_NAMES[e.festivalId],
    category: e.categoryLabel,
    year: e.ceremonyYear,
  }));
  const seen = new Set(wins.map((w) => `${w.festivalId}-${w.year}-${w.category}`));

  // 제목이 정확히 같은(한/영, 기호·공백 무시) 수상작이거나 이 수상작 항목 자체일 때만 인정.
  const myTitles = new Set([titleKo, titleEn].filter(Boolean).map((t) => normForComp(t!)).filter((t) => t.length >= 2));
  for (const { festival, winners } of festivalLists) {
    for (const w of winners) {
      const isSelf = movieId?.startsWith(`wikidata-${w.filmQid}`) ?? false;
      const titleHit = [w.titleKo, w.titleEn].some((t) => t && myTitles.has(normForComp(t)));
      // TMDB id가 같으면 같은 영화 — 한국 개봉 제목이 수상작 목록의 제목과 달라도 찾는다.
      const tmdbHit = Boolean(tmdbId && w.tmdbId && w.tmdbId === tmdbId);
      if (!isSelf && !titleHit && !tmdbHit) continue;
      const key = `${festival}-${w.ceremonyYear}-${w.categoryLabel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      wins.push({ festivalId: festival, festivalName: FESTIVAL_NAMES[festival], category: w.categoryLabel, year: w.ceremonyYear });
    }
  }

  for (const o of official) {
    if (!(o.festival in FESTIVAL_NAMES)) continue;
    const festivalId = o.festival as FestivalType;
    const key = `${festivalId}-${o.year}-${o.awardCategory}`;
    if (seen.has(key)) continue;
    seen.add(key);
    wins.push({ festivalId, festivalName: FESTIVAL_NAMES[festivalId], category: o.awardCategory, year: o.year });
  }

  return wins.sort(
    (a, b) =>
      b.year - a.year ||
      FESTIVAL_ORDER.indexOf(a.festivalId) - FESTIVAL_ORDER.indexOf(b.festivalId)
  );
}
