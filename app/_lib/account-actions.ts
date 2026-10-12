"use server";

import { auth } from "../../auth";
import { db } from "./db";
import { getUserReviewStats } from "./review-data";

// 헤더 계정 메뉴 맨 위 "평가 N편 · 한줄평 N개" — 메뉴를 열 때만 불러온다(모든 페이지 로드마다 조회하지 않음).
// 평가 = 평점을 남긴 영화 수(기존 getUserReviewStats.movieCount), 한줄평 = 글이 있는 한줄평 수.
export async function getAccountSummaryAction(): Promise<{ ratedMovies: number; shortReviews: number } | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  try {
    const [stats, shortReviews] = await Promise.all([
      getUserReviewStats(userId),
      db.review.count({ where: { userId, type: "SHORT", NOT: { content: "" } } }),
    ]);
    return { ratedMovies: stats.movieCount, shortReviews };
  } catch {
    return null;
  }
}
