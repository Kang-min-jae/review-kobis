import { NextResponse } from "next/server";
import { db } from "../../../_lib/db";
import { getBadge } from "../../../_lib/tier";
import { SPOILER_PLACEHOLDER } from "../../../_lib/spoiler";

export type TopReview = {
  id: string;
  authorId: string;
  authorName: string;
  authorTier: string;
  rating: number;
  content: string;
  isSpoiler: boolean; // true면 content는 본문 대신 "스포일러가 포함된 한줄평" 문구다
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

async function handleGet(request: Request) {
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
    // 미리보기(박스오피스 뒤집기 카드·호버 팝업)엔 스포일러 본문을 싣지 않는다.
    content: r.hasSpoiler && r.content.trim() ? SPOILER_PLACEHOLDER : r.content,
    isSpoiler: r.hasSpoiler && r.content.trim().length > 0,
    likeCount: r.likeCount,
    dislikeCount: r.dislikeCount,
  }));

  return NextResponse.json({ reviews });
}

// 모든 방문자에게 같은 결과라 CDN에 1분 캐시한다 — 박스오피스 카드를 넘길 때마다 서버 함수가 돌지 않게.
export async function GET(request: Request) {
  const res = await handleGet(request);
  if (res.status === 200) res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return res;
}
