"use server";

import { revalidatePath, updateTag } from "next/cache";
// 평점·리뷰가 바뀌면 그 영화 페이지, 내 리스트, 홈 히어로, 카드의 평균 별점(RATING_AVERAGES_TAG)만 바로 갱신한다.
// 예전엔 revalidatePath("/", "layout")로 사이트 전체 캐시(박스오피스·Best 행·수상작 등)를 매번 지워, 평점 하나마다
// 다음 방문자가 모든 행을 처음부터 다시 계산했다(서버 CPU 사용량의 큰 원인). 이제 행 목록은 그대로 두고 숫자만 다시 읽는다.
import { HOME_HERO_TAG } from "./home-hero";
import { RATING_AVERAGES_TAG } from "./fresh-ratings";
import { db } from "./db";
import { auth } from "../../auth";
import { cdToMovieId } from "./rating-input";

// ── 입력 검증 ─────────────────────────────────────────────────────────────
// 서버 액션은 밖에서 직접 호출할 수 있다 — 화면을 거치지 않고 점수 1000점, 없는 항목 이름,
// 아주 긴 글을 저장하면 사이트 전체의 평균·Best 순위·추천이 오염된다. 화면이 허용하는 범위만 받는다.
const REVIEW_CATEGORIES = ["전체", "연출", "연기", "각본", "음악", "편집"];
const MOVIE_CD_PATTERN = /^(\d{1,20}|tmdb-(tv-)?\d{1,12}|kmdb-[A-Za-z0-9_-]{1,40}|wikidata-Q\d{1,12})$/;
const SHORT_CONTENT_MAX = 500; // 화면 입력 제한 200자 + 여유
const LONG_CONTENT_MAX = 20000;

function assertMovieCd(movieCd: unknown): asserts movieCd is string {
  if (typeof movieCd !== "string" || !MOVIE_CD_PATTERN.test(movieCd)) throw new Error("잘못된 영화입니다.");
}

function assertCategory(category: unknown): asserts category is string {
  if (typeof category !== "string" || !REVIEW_CATEGORIES.includes(category)) throw new Error("잘못된 평가 항목입니다.");
}

function assertScore(score: unknown, max: number): asserts score is number {
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > max) {
    throw new Error(`평점은 0~${max} 사이여야 합니다.`);
  }
}

function categoryPath(movieId: string, category: string): string {
  const base = movieId.startsWith("tmdb-tv-") ? "/series" : "/movies";
  return `${base}/${movieId}/rate/category/${encodeURIComponent(category)}`;
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
  assertMovieCd(movieCd);
  assertCategory(category);
  assertScore(score, 10);

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
  updateTag(HOME_HERO_TAG);
  updateTag(RATING_AVERAGES_TAG);
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
  updateTag(HOME_HERO_TAG);
  updateTag(RATING_AVERAGES_TAG);
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
  // "스포일러가 있어요" 체크 여부. 빠지면(예전 화면) 기존 리뷰의 표시를 그대로 둔다.
  isSpoiler?: boolean;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  const userId = session.user.id;
  if (input.isSpoiler !== undefined && typeof input.isSpoiler !== "boolean") throw new Error("잘못된 요청입니다.");
  assertMovieCd(input.movieCd);
  assertCategory(input.category);
  if (input.type !== "SHORT" && input.type !== "LONG") throw new Error("잘못된 리뷰 종류입니다.");
  assertScore(input.rating, input.type === "SHORT" ? 10 : 100);
  if (typeof input.content !== "string" || input.content.length > (input.type === "SHORT" ? SHORT_CONTENT_MAX : LONG_CONTENT_MAX)) {
    throw new Error("리뷰 내용이 너무 길어요.");
  }
  const key = { userId, movieCd: input.movieCd, category: input.category, type: input.type };

  // 스포일러 표시는 작성자가 고른다(등록·수정 때 켜고 끌 수 있음). 글 없이 평점만 남기면 가릴 본문이 없어 끈다.
  // 신고 누적으로 켜진 표시를 작성자가 그대로 두면 출처("reports")도 유지한다.
  const existing = await db.review.findUnique({
    where: { userId_movieCd_category_type: key },
    select: { hasSpoiler: true, spoilerFlagSource: true },
  });
  const hasSpoiler = input.content.trim().length > 0 && (input.isSpoiler ?? existing?.hasSpoiler ?? false);
  const spoilerFlagSource = !hasSpoiler
    ? null
    : existing?.hasSpoiler
      ? (existing.spoilerFlagSource ?? "author")
      : "author";

  await db.review.upsert({
    where: { userId_movieCd_category_type: key },
    create: { ...key, rating: input.rating, content: input.content, hasSpoiler, spoilerFlagSource },
    update: { rating: input.rating, content: input.content, hasSpoiler, spoilerFlagSource },
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
    // 한줄평이 이미 있으면 한줄평 점수를 유지한다(resyncCategoryRating과 같은 규칙) — 예전엔
    // 장문평을 쓸 때마다 덮어써서, 같은 평점도 한줄평·장문평을 쓴 순서에 따라 값이 달라졌다.
    await resyncCategoryRating(userId, input.movieCd, "전체");
  }

  revalidatePath(categoryPath(input.movieId, input.category));
  updateTag(HOME_HERO_TAG);
  updateTag(RATING_AVERAGES_TAG);
}

// 리뷰가 지워진 뒤 CategoryRating을 남은 리뷰와 맞춘다. submitReviewAction이 한줄평
// (모든 항목)과 "전체" 장문평을 CategoryRating에 복사해 두므로, 리뷰만 지우고 이걸
// 그대로 두면 다이어리·리스트·Best 행(모두 CategoryRating 기준)에 평점이 계속 남는다.
async function resyncCategoryRating(userId: string, movieCd: string, category: string) {
  const short = await db.review.findUnique({
    where: { userId_movieCd_category_type: { userId, movieCd, category, type: "SHORT" } },
  });
  const long = !short && category === "전체"
    ? await db.review.findUnique({
        where: { userId_movieCd_category_type: { userId, movieCd, category, type: "LONG" } },
      })
    : null;
  const score = short ? short.rating : long ? Math.round((long.rating / 100) * 10 * 10) / 10 : null;

  if (score === null) {
    await db.categoryRating.deleteMany({ where: { userId, movieCd, category } });
    return;
  }
  await db.categoryRating.upsert({
    where: { userId_movieCd_category: { userId, movieCd, category } },
    create: { userId, movieCd, category, score },
    update: { score },
  });
}

// 내가 남긴 리뷰 하나를 삭제한다. 보안상 자기 리뷰만 지울 수 있도록 userId도
// 조건에 포함한다.
export async function deleteReviewAction(input: {
  reviewId: string;
  movieId: string;
  category: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  const userId = session.user.id;

  const review = await db.review.findFirst({ where: { id: input.reviewId, userId } });
  if (review) {
    await db.review.delete({ where: { id: review.id } });
    await resyncCategoryRating(userId, review.movieCd, review.category);
  }

  revalidatePath(categoryPath(input.movieId, input.category));
  revalidatePath("/my-list");
  updateTag(HOME_HERO_TAG);
  updateTag(RATING_AVERAGES_TAG);
}

// 무비 다이어리에서 한 영화의 기록을 지울 때, 그 영화로 남긴 리뷰(항목·타입별)를
// 서버에서도 지운다 — 예전엔 이 브라우저의 localStorage에서만 지워져 다른 기기와
// 서버 평점엔 그대로 남아 있었다.
export async function deleteMyMovieReviewsAction(
  movieCd: string,
  entries: { category: string; type: "SHORT" | "LONG" }[],
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  const userId = session.user.id;

  for (const { category, type } of entries) {
    await db.review.deleteMany({ where: { userId, movieCd, category, type } });
  }
  for (const category of new Set(entries.map((e) => e.category))) {
    await resyncCategoryRating(userId, movieCd, category);
  }

  revalidatePath("/my-list");
  updateTag(HOME_HERO_TAG);
  updateTag(RATING_AVERAGES_TAG);
}

export async function adminDeleteReviewAction(input: { reviewId: string }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("권한 없음");

  const review = await db.review.findUnique({
    where: { id: input.reviewId },
    select: { movieCd: true, category: true, userId: true },
  });
  if (!review) return;

  await db.review.delete({ where: { id: input.reviewId } });

  revalidatePath(categoryPath(cdToMovieId(review.movieCd), review.category));
  revalidatePath(`/users/${review.userId}`);
  revalidatePath("/my-list");
  updateTag(HOME_HERO_TAG);
  updateTag(RATING_AVERAGES_TAG);
}

export async function getAdminStats() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("권한 없음");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalUsers, newUsersToday, totalReviews, pendingInquiries] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: today } } }),
    db.review.count(),
    db.inquiry.count({ where: { status: "답변 대기" } }),
  ]);

  return { totalUsers, newUsersToday, totalReviews, pendingInquiries };
}

export async function getAllReviewsForAdmin(opts: { search?: string; skip?: number; take?: number }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("권한 없음");

  const { search, skip = 0, take = 50 } = opts;
  const [rows, movies] = await Promise.all([
    db.review.findMany({
      where: search
        ? {
            OR: [
              { user: { nickname: { contains: search, mode: "insensitive" } } },
              { user: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        movieCd: true,
        category: true,
        type: true,
        rating: true,
        content: true,
        createdAt: true,
        userId: true,
        user: { select: { id: true, nickname: true, name: true } },
      },
    }),
    db.cachedMovie.findMany({ select: { movieCd: true, title: true } }),
  ]);

  const titleMap = new Map(movies.map((m) => [m.movieCd, m.title]));
  return rows.map((r) => ({
    ...r,
    movieTitle: titleMap.get(r.movieCd) ?? r.movieCd,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getAllUsersForAdmin(opts: { search?: string; skip?: number; take?: number }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("권한 없음");

  const { search, skip = 0, take = 50 } = opts;
  return db.user.findMany({
    where: search
      ? {
          OR: [
            { nickname: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      name: true,
      nickname: true,
      email: true,
      role: true,
      totalLikes: true,
      createdAt: true,
      _count: { select: { reviews: true, followers: true } },
    },
  });
}
