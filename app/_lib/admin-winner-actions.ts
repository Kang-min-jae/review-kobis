"use server";

import { updateTag } from "next/cache";
import { db } from "./db";
import { auth } from "../../auth";
import { isValidAward, sanitizePosterUrl } from "./festival-awards";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("권한 없음");
}

export async function saveOfficialWinnerAction(input: {
  year: number;
  festival: string;
  awardCategory: string;
  movieId: string;
  movieTitle: string;
  posterUrl: string | null;
}) {
  await requireAdmin();
  if (!isValidAward(input.festival, input.awardCategory)) throw new Error("잘못된 영화제·부문입니다.");
  if (!Number.isInteger(input.year) || input.year < 1900 || input.year > 2100) throw new Error("잘못된 연도입니다.");
  input = { ...input, posterUrl: sanitizePosterUrl(input.posterUrl) };
  await db.officialWinner.upsert({
    where: { year_festival_awardCategory: { year: input.year, festival: input.festival, awardCategory: input.awardCategory } },
    create: input,
    update: { movieId: input.movieId, movieTitle: input.movieTitle, posterUrl: input.posterUrl, updatedAt: new Date() },
  });
  updateTag("official-winners");
}

export async function deleteOfficialWinnerAction(id: string) {
  await requireAdmin();
  await db.officialWinner.delete({ where: { id } });
  updateTag("official-winners");
}

export async function listOfficialWinnersAction(festival?: string, year?: number) {
  await requireAdmin();
  return db.officialWinner.findMany({
    where: {
      ...(festival ? { festival } : {}),
      ...(year ? { year } : {}),
    },
    orderBy: [{ year: "desc" }, { festival: "asc" }, { awardCategory: "asc" }],
  });
}
