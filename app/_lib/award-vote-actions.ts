"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { auth } from "../../auth";

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
