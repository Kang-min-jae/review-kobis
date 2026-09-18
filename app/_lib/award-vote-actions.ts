"use server";

import { revalidateTag } from "next/cache";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { auth } from "../../auth";
import type { FestivalWinner } from "./wikidata";

export type OfficialWinner = {
  title: string;
  titleEn: string | null;
  posterUrl: string | null;
  ceremonyYear: number;
  categoryLabel: string;
  filmQid: string;
};

// 공식 수상작은 연 1회만 바뀌므로 24시간 캐시 + 어드민 등록 시 즉시 재검증.
const getCachedOfficialWinner = unstable_cache(
  async (festival: string, awardCategory: string): Promise<OfficialWinner | null> => {
    const cached = await db.cachedAwardWinners.findUnique({ where: { id: festival } });
    if (!cached) return null;

    const winners = cached.winners as FestivalWinner[];
    const match = winners.find(
      (w) =>
        w.categoryLabel === awardCategory ||
        w.categoryLabel.includes(awardCategory) ||
        awardCategory.includes(w.categoryLabel)
    );
    if (!match) return null;

    const cachedMovie = await db.cachedMovie.findUnique({
      where: { movieCd: `wikidata-${match.filmQid}` },
      select: { posterUrl: true },
    });

    return {
      title: match.titleKo ?? match.titleEn ?? "",
      titleEn: match.titleEn ?? null,
      posterUrl: cachedMovie?.posterUrl ?? null,
      ceremonyYear: match.ceremonyYear,
      categoryLabel: match.categoryLabel,
      filmQid: match.filmQid,
    };
  },
  ["official-winner"],
  { revalidate: 60 * 60 * 24, tags: ["official-winners"] }
);

export async function getOfficialWinner(
  festival: string,
  awardCategory: string
): Promise<OfficialWinner | null> {
  return getCachedOfficialWinner(festival, awardCategory);
}

// 어드민에서 공식 수상작을 등록/갱신한 뒤 호출하면 캐시가 즉시 무효화된다.
export async function revalidateOfficialWinnersCache() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("권한 없음");
  revalidateTag("official-winners");
}

export type AwardVoteResult = {
  movieId: string;
  movieTitle: string;
  posterUrl: string | null;
  count: number;
  myVote: boolean;
};

// 득표 현황 — AwardVoteSummary(집계 캐시)에서 읽어 COUNT(*) 연산 없이 반환.
export async function getAwardVotes(
  festival: string,
  awardCategory: string
): Promise<AwardVoteResult[]> {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [summaries, myVote] = await Promise.all([
    db.awardVoteSummary.findMany({
      where: { festival, awardCategory },
      orderBy: { voteCount: "desc" },
    }),
    userId
      ? db.awardVote.findUnique({
          where: { userId_festival_awardCategory: { userId, festival, awardCategory } },
          select: { movieId: true },
        })
      : null,
  ]);

  const myMovieId = myVote?.movieId ?? null;

  return summaries.map((s) => ({
    movieId: s.movieId,
    movieTitle: s.movieTitle,
    posterUrl: s.posterUrl ?? null,
    count: s.voteCount,
    myVote: s.movieId === myMovieId,
  }));
}

function voteTag(festival: string, awardCategory: string) {
  return `vote-summary-${festival}-${awardCategory}`;
}

// 투표 (1인 1표 — 이미 투표했으면 해당 부문 표를 다른 영화로 변경)
export async function submitAwardVoteAction(input: {
  festival: string;
  awardCategory: string;
  movieId: string;
  movieTitle: string;
  posterUrl: string | null;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  const userId = session.user.id;

  const key = { userId, festival: input.festival, awardCategory: input.awardCategory };

  // 이전 투표가 있으면 해당 영화 집계를 -1하고 새 영화를 +1
  const prev = await db.awardVote.findUnique({ where: { userId_festival_awardCategory: key } });

  await db.$transaction(async (tx) => {
    // AwardVote upsert (실제 투표 레코드)
    await tx.awardVote.upsert({
      where: { userId_festival_awardCategory: key },
      create: { ...key, movieId: input.movieId, movieTitle: input.movieTitle, posterUrl: input.posterUrl },
      update: { movieId: input.movieId, movieTitle: input.movieTitle, posterUrl: input.posterUrl },
    });

    // 이전 영화 집계 -1
    if (prev && prev.movieId !== input.movieId) {
      await tx.awardVoteSummary.updateMany({
        where: { festival: input.festival, awardCategory: input.awardCategory, movieId: prev.movieId },
        data: { voteCount: { decrement: 1 } },
      });
    }

    // 새 영화 집계 +1 (처음 투표거나 영화를 바꾼 경우)
    if (!prev || prev.movieId !== input.movieId) {
      await tx.awardVoteSummary.upsert({
        where: { festival_awardCategory_movieId: { festival: input.festival, awardCategory: input.awardCategory, movieId: input.movieId } },
        create: { festival: input.festival, awardCategory: input.awardCategory, movieId: input.movieId, movieTitle: input.movieTitle, posterUrl: input.posterUrl, voteCount: 1 },
        update: { voteCount: { increment: 1 }, movieTitle: input.movieTitle, posterUrl: input.posterUrl },
      });
    }
  });

  revalidateTag(voteTag(input.festival, input.awardCategory));
}

// 투표 취소
export async function deleteAwardVoteAction(festival: string, awardCategory: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  const userId = session.user.id;

  const existing = await db.awardVote.findUnique({
    where: { userId_festival_awardCategory: { userId, festival, awardCategory } },
    select: { movieId: true },
  });
  if (!existing) return;

  await db.$transaction([
    db.awardVote.deleteMany({ where: { userId, festival, awardCategory } }),
    db.awardVoteSummary.updateMany({
      where: { festival, awardCategory, movieId: existing.movieId },
      data: { voteCount: { decrement: 1 } },
    }),
  ]);

  revalidateTag(voteTag(festival, awardCategory));
}
