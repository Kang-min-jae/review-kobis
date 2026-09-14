"use server";

import { revalidatePath } from "next/cache";
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

// 현재 선택된 (festival, awardCategory) 조합의 Wikidata 공식 수상작 반환.
// CachedAwardWinners → CachedMovie(포스터) 순으로 조회하며, 캐시가 없으면 null.
export async function getOfficialWinner(
  festival: string,
  awardCategory: string
): Promise<OfficialWinner | null> {
  const cached = await db.cachedAwardWinners.findUnique({ where: { id: festival } });
  if (!cached) return null;

  const winners = cached.winners as FestivalWinner[];
  // categoryLabel이 정확히 일치하거나 한쪽이 다른 쪽을 포함하면 매칭
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
}

export type AwardVoteResult = {
  movieId: string;
  movieTitle: string;
  posterUrl: string | null;
  count: number;
  myVote: boolean;
};

// 특정 영화제 + 부문의 투표 현황 반환 (로그인 없어도 조회 가능)
export async function getAwardVotes(
  festival: string,
  awardCategory: string
): Promise<AwardVoteResult[]> {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const votes = await db.awardVote.findMany({
    where: { festival, awardCategory },
    select: { movieId: true, movieTitle: true, posterUrl: true, userId: true },
  });

  const countMap = new Map<string, { title: string; poster: string | null; count: number }>();
  for (const v of votes) {
    const existing = countMap.get(v.movieId);
    if (existing) {
      existing.count += 1;
    } else {
      countMap.set(v.movieId, { title: v.movieTitle, poster: v.posterUrl, count: 1 });
    }
  }

  const myVoteMovieId = userId
    ? votes.find((v) => v.userId === userId)?.movieId ?? null
    : null;

  return Array.from(countMap.entries())
    .map(([movieId, { title, poster, count }]) => ({
      movieId,
      movieTitle: title,
      posterUrl: poster,
      count,
      myVote: movieId === myVoteMovieId,
    }))
    .sort((a, b) => b.count - a.count);
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
  await db.awardVote.upsert({
    where: { userId_festival_awardCategory: key },
    create: { ...key, movieId: input.movieId, movieTitle: input.movieTitle, posterUrl: input.posterUrl },
    update: { movieId: input.movieId, movieTitle: input.movieTitle, posterUrl: input.posterUrl },
  });

  revalidatePath("/awards");
}

// 투표 취소
export async function deleteAwardVoteAction(festival: string, awardCategory: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  const userId = session.user.id;

  await db.awardVote.deleteMany({ where: { userId, festival, awardCategory } });
  revalidatePath("/awards");
}
