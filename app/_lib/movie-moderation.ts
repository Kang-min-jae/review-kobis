// 작품 노출 관리(MovieModeration) 읽기·쓰기 — 성인물 자동 판정 결과와 관리자 숨김.
// 판정 규칙 자체는 adult-content.ts 한 곳에 있다. 여기는 그 결과를 저장하고, 목록 쿼리가 쓸 "뺄 작품 목록"을 만든다.
//
// 이 테이블이 아직 없어도(코드가 마이그레이션보다 먼저 배포돼도) 깨지지 않게, 읽기는 실패하면 "표시된 작품 없음"으로,
// 쓰기는 실패해도 조용히 넘어간다. 목록 쿼리도 이 테이블을 직접 JOIN하지 않고 아래 목록(movieCd 배열)을 조건으로 받는다.
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { Prisma } from "../generated/prisma/client";
import { db } from "./db";
import {
  adultContentReason,
  MIN_TMDB_VOTES_TEEN_RESTRICTED,
  NOT_ADULT_GENRE_WHERE,
  NOT_RESTRICTED_GRADE_WHERE,
  type AdultSignals,
} from "./adult-content";

// 숨김·판정이 바뀌면 이 태그만 갱신한다(목록 캐시는 "movie-rows", 추천 캐시는 "recommendations").
export const MOVIE_MODERATION_TAG = "movie-moderation";

let warnedMissingTable = false;
function warnOnce(error: unknown) {
  if (warnedMissingTable) return;
  warnedMissingTable = true;
  console.warn("[moderation] MovieModeration을 읽지 못해 숨김·성인물 표시 없이 진행합니다(마이그레이션 전일 수 있음):", error instanceof Error ? error.message : error);
}

// 메인·추천·목록·검색에서 뺄 작품: 관리자 숨김 + 성인물 판정 + 이름 없는 청불(청소년관람불가인데 TMDB 투표가 아주 적음).
async function loadExcludedMovieCds(): Promise<string[]> {
  try {
    const rows = await db.$queryRaw<{ movieCd: string }[]>`
      SELECT mm."movieCd"
      FROM "MovieModeration" mm
      LEFT JOIN "CachedMovie" c ON c."movieCd" = mm."movieCd"
      WHERE mm."hidden" OR mm."adult"
         OR (mm."tmdbVoteCount" < ${MIN_TMDB_VOTES_TEEN_RESTRICTED} AND c."watchGrade" ~ '청소년[[:space:]]*관람[[:space:]]*불가|18세')
    `;
    return rows.map((r) => r.movieCd);
  } catch (error) {
    warnOnce(error);
    return [];
  }
}

const getExcludedMovieCdsCached = unstable_cache(loadExcludedMovieCds, ["excluded-movie-cds-v1"], {
  revalidate: 60 * 60 * 24,
  tags: [MOVIE_MODERATION_TAG],
});

// 요청 하나 안에서는 한 번만 읽는다.
export const getExcludedMovieCds = cache(async (): Promise<string[]> => getExcludedMovieCdsCached().catch(() => []));

export async function getExcludedMovieSet(): Promise<ReadonlySet<string>> {
  return new Set(await getExcludedMovieCds());
}

// CachedMovie findMany의 where.AND에 넣는 조건 — 성인 장르·제한상영가·숨김/판정된 작품 제외.
export function listableMovieConditions(excluded: readonly string[]): object[] {
  return [
    NOT_ADULT_GENRE_WHERE,
    NOT_RESTRICTED_GRADE_WHERE,
    ...(excluded.length > 0 ? [{ movieCd: { notIn: [...excluded] } }] : []),
  ];
}

// 직접 쓴 SQL용 같은 조건. alias는 CachedMovie의 별칭(예: Prisma.raw('m')).
export function listableMovieSql(alias: Prisma.Sql, excluded: readonly string[]): Prisma.Sql {
  return Prisma.sql`
    AND (${alias}."genreAlt" IS NULL OR (${alias}."genreAlt" NOT LIKE '%에로%' AND ${alias}."genreAlt" NOT LIKE '%성인%'))
    AND (${alias}."watchGrade" IS NULL OR ${alias}."watchGrade" NOT LIKE '%제한상영%')
    ${excluded.length > 0 ? Prisma.sql`AND NOT (${alias}."movieCd" = ANY(${[...excluded]}::text[]))` : Prisma.empty}
  `;
}

export type MovieModerationInfo = { hidden: boolean; reason: string | null; adult: boolean; adultReason: string | null };

// 상세 페이지용 — 한 작품의 숨김·판정 상태. 읽지 못하면 null(보통처럼 보여 준다).
// 제목 만들기(generateMetadata)와 본문이 같은 요청에서 각각 부르므로 요청당 한 번만 읽는다.
export const getMovieModeration = cache(getMovieModerationUncached);

async function getMovieModerationUncached(movieCd: string): Promise<MovieModerationInfo | null> {
  try {
    return await db.movieModeration.findUnique({
      where: { movieCd },
      select: { hidden: true, reason: true, adult: true, adultReason: true },
    });
  } catch (error) {
    warnOnce(error);
    return null;
  }
}

// 추천 최소 품질용 — 저장된 TMDB 투표 수(모르면 없음).
export async function getTmdbVoteCounts(movieCds: string[]): Promise<Map<string, number>> {
  if (movieCds.length === 0) return new Map();
  try {
    const rows = await db.movieModeration.findMany({
      where: { movieCd: { in: movieCds }, tmdbVoteCount: { not: null } },
      select: { movieCd: true, tmdbVoteCount: true },
    });
    return new Map(rows.map((r) => [r.movieCd, r.tmdbVoteCount as number]));
  } catch (error) {
    warnOnce(error);
    return new Map();
  }
}

// 상세 정보를 불러올 때 함께 판정해 저장한다(외부 API를 따로 부르지 않는다 — 이미 받은 정보만 쓴다).
// complete=false(이번에 TMDB 정보를 못 받음)면 이전에 성인물로 판정된 것을 "아님"으로 되돌리지 않는다.
export async function saveAdultJudgment(movieCd: string, signals: AdultSignals, { complete }: { complete: boolean }): Promise<string | null> {
  const reason = adultContentReason(signals);
  const votes = signals.tmdbVoteCount ?? undefined;
  const now = new Date();
  try {
    await db.movieModeration.upsert({
      where: { movieCd },
      select: { movieCd: true },
      create: { movieCd, adult: reason !== null, adultReason: reason, tmdbVoteCount: votes ?? null, checkedAt: now },
      update: reason !== null || complete
        ? { adult: reason !== null, adultReason: reason, ...(votes !== undefined ? { tmdbVoteCount: votes } : {}), checkedAt: now }
        : { ...(votes !== undefined ? { tmdbVoteCount: votes } : {}), checkedAt: now },
    });
  } catch (error) {
    warnOnce(error);
  }
  return reason;
}

// 관리자 숨김/해제.
export async function setMovieHidden(movieCd: string, hidden: boolean, reason: string | null, adminId: string): Promise<void> {
  const now = new Date();
  await db.movieModeration.upsert({
    where: { movieCd },
    select: { movieCd: true },
    create: { movieCd, hidden, reason, moderatedBy: adminId, moderatedAt: now },
    update: { hidden, reason, moderatedBy: adminId, moderatedAt: now },
  });
}
