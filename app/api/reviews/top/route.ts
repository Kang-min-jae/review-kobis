import { NextResponse } from "next/server";
import { db } from "../../../_lib/db";

export type TopReview = {
  id: string;
  authorName: string;
  rating: number;
  content: string;
  likeCount: number;
  dislikeCount: number;
};

// GET /api/reviews/top?movieCd=XXXXXXXX
// 해당 영화의 "전체" 카테고리 한줄평(SHORT)을 좋아요 내림차순, 최신 작성일 순으로 최대 2개 반환.
// BoxOfficeCoverflow 뒤집기 카드와 TopReviewsPanel(호버 팝업)이 공통으로 사용한다.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const movieCd = searchParams.get("movieCd");
  if (!movieCd || !/^\d+$/.test(movieCd)) {
    return NextResponse.json({ reviews: [] });
  }

  const rows = await db.review.findMany({
    where: { movieCd, category: "전체", type: "SHORT" },
    orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
    take: 2,
    include: { user: { select: { nickname: true, name: true } } },
  });

  const reviews: TopReview[] = rows.map((r) => ({
    id: r.id,
    authorName: r.user.nickname ?? r.user.name ?? "사용자",
    rating: r.rating,
    content: r.content,
    likeCount: r.likeCount,
    dislikeCount: r.dislikeCount,
  }));

  return NextResponse.json({ reviews });
}
