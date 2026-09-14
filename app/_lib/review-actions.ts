"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { auth } from "../../auth";
import { containsSpoilerKeyword } from "./spoiler";

function categoryPath(movieId: string, category: string): string {
  return `/movies/${movieId}/rate/category/${encodeURIComponent(category)}`;
}

// 항목별 빠른 별점(글 없는 숫자만) 등록/수정. 1인 1표 — 같은 사람이 같은 영화의
// 같은 항목에 다시 매기면 upsert로 덮어쓴다.
export async function submitCategoryRatingAction(
  movieId: string,
  movieCd: string,
  category: string,
  score: number
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  const userId = session.user.id;

  await db.categoryRating.upsert({
    where: { userId_movieCd_category: { userId, movieCd, category } },
    create: { userId, movieCd, category, score },
    update: { score },
  });

  // "전체" 평점은 한줄평과 같은 0~10 척도라 그대로 겹쳐 쓴다 — 리뷰 글 없이 평점만
  // 남겨도 한줄평 평점에 같이 반영되도록, 한줄평이 아직 없으면 평점만 있고 글은
  // 빈 한줄평 레코드를 만들고, 이미 있으면 평점만 갱신한다(글은 안 건드린다 —
  // 사용자가 이미 쓴 한줄평 내용을 지우면 안 된다).
  if (category === "전체") {
    const key = { userId, movieCd, category: "전체", type: "SHORT" as const };
    const existing = await db.review.findUnique({ where: { userId_movieCd_category_type: key } });
    if (existing) {
      await db.review.update({ where: { userId_movieCd_category_type: key }, data: { rating: score } });
    } else {
      await db.review.create({ data: { ...key, rating: score, content: "" } });
    }
  }

  revalidatePath(categoryPath(movieId, category));
}

// 무비 다이어리/나만의 영화 리스트의 "계정 평점"(전체 평점 남기기로 자동 기록된
// 항목) 삭제. CategoryRating을 지우면 getMyRatedMovies가 더 이상 이 영화를 안
// 돌려줘서 다이어리·리스트에서 자동으로 사라진다. 평점만 있고 글은 없는(자동
// 동기화된) 한줄평도 같이 지우되, 사용자가 실제로 글을 쓴 한줄평은 보존한다.
export async function deleteAccountRatingAction(movieCd: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  const userId = session.user.id;

  await db.categoryRating.deleteMany({ where: { userId, movieCd, category: "전체" } });
  await db.review.deleteMany({
    where: { userId, movieCd, category: "전체", type: "SHORT", content: "" },
  });

  revalidatePath("/my-list");
}

// 한줄평/장문평 등록/수정. 같은 사람이 같은 영화·항목·타입에 이미 남긴 리뷰가
// 있으면 그 리뷰를 덮어쓴다(한 사람당 한 항목엔 리뷰 하나).
// "전체" 한줄평을 남기면 CategoryRating도 함께 동기화해 다이어리·리스트에 반영한다.
export async function submitReviewAction(input: {
  movieId: string;
  movieCd: string;
  category: string;
  type: "SHORT" | "LONG";
  rating: number;
  content: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  const userId = session.user.id;
  const hasSpoiler = containsSpoilerKeyword(input.content);
  const key = { userId, movieCd: input.movieCd, category: input.category, type: input.type };

  await db.review.upsert({
    where: { userId_movieCd_category_type: key },
    create: { ...key, rating: input.rating, content: input.content, hasSpoiler },
    update: { rating: input.rating, content: input.content, hasSpoiler },
  });

  // 한줄평은 모든 카테고리를 CategoryRating에 동기화해 항목별 평균에 반영한다.
  // 장문평은 "전체"만 동기화하되 0~100 → 0~10으로 정규화한다.
  if (input.type === "SHORT") {
    await db.categoryRating.upsert({
      where: { userId_movieCd_category: { userId, movieCd: input.movieCd, category: input.category } },
      create: { userId, movieCd: input.movieCd, category: input.category, score: input.rating },
      update: { score: input.rating },
    });
  } else if (input.type === "LONG" && input.category === "전체") {
    const score = Math.round((input.rating / 100) * 10 * 10) / 10;
    await db.categoryRating.upsert({
      where: { userId_movieCd_category: { userId, movieCd: input.movieCd, category: "전체" } },
      create: { userId, movieCd: input.movieCd, category: "전체", score },
      update: { score },
    });
  }

  revalidatePath(categoryPath(input.movieId, input.category));
}
