import { NextResponse } from "next/server";
import { db } from "../../../_lib/db";
import { getBadge } from "../../../_lib/tier";

export type TopReview = {
  id: string;
  authorId: string;
  authorName: string;
  authorTier: string;
  rating: number;
  content: string;
  likeCount: number;
  dislikeCount: number;
};

// GET /api/reviews/top?movieCd=XXXXXXXX
// 해당 영화의 "전체" 카테고리 한줄평(SHORT)을 좋아요 내림차순, 최신 작성일 순으로 최대 2개 반환.
// BoxOfficeCoverflow 뒤집기 카드와 TopReviewsPanel(호버 팝업)이 공통으로 사용한다.
// 리뷰 DB의 movieCd 형식(KOBIS 숫자, tmdb-*, tmdb-tv-*, kmdb-*, wikidata-Q*)만 받는다.
function isValidMovieCd(cd: string | null): cd is string {
  if (!cd) return false;
  return /^(\d{1,20}|tmdb-(tv-)?\d{1,12}|kmdb-[A-Za-z0-9_-]{1,40}|wikidata-Q\d{1,12})$/.test(cd);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const movieCd = searchParams.get("movieCd");
  if (!isValidMovieCd(movieCd)) {
    return NextResponse.json({ reviews: [] });
  }

  const rows = await db.review.findMany({
    where: { movieCd, category: "전체", type: "SHORT" },
    orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
    take: 2,
    include: { user: { select: { nickname: true, name: true, totalLikes: true } } },
  });

  const reviews: TopReview[] = rows.map((r) => ({
    id: r.id,
    authorId: r.userId,
    authorName: r.user.nickname ?? r.user.name ?? "사용자",
    authorTier: getBadge(r.user.totalLikes),
    rating: r.rating,
    content: r.content,
    likeCount: r.likeCount,
    dislikeCount: r.dislikeCount,
  }));

  return NextResponse.json({ reviews });
}
