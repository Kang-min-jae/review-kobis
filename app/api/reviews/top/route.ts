import { NextResponse } from "next/server";
import { db } from "../../../_lib/db";
import { getBadge } from "../../../_lib/tier";
import { SPOILER_PLACEHOLDER } from "../../../_lib/spoiler";

// 외부 API·AI 응답이 늦어도 이 시간 안에 끝낸다(함수가 오래 붙잡혀 사용량이 늘지 않게).
export const maxDuration = 30;

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

// 모든 방문자에게 같은 결과라 CDN에 캐시한다. 화면은 카드의 한줄평 수·평균을 v=로 붙여 보내서, 새 한줄평이
// 달리면 주소가 달라져 새 목록을 받는다(v는 캐시 키 구분용일 뿐 서버는 읽지 않는다). 그래서 v가 붙은 요청은
// 하루 캐시한다 — 예전엔 1분이라, 누가 홈을 열 때마다(박스오피스 첫 카드) 잠든 DB(Neon)를 깨웠다.
// 하루 안에 달라질 수 있는 것은 공감 수와 그에 따른 두 줄의 순서뿐이다. v가 없는 요청은 지금처럼 1분.
export async function GET(request: Request) {
  const res = await handleGet(request);
  if (res.status === 200) {
    const versioned = new URL(request.url).searchParams.has("v");
    res.headers.set(
      "Cache-Control",
      versioned ? "public, s-maxage=86400, stale-while-revalidate=86400" : "public, s-maxage=60, stale-while-revalidate=60",
    );
  }
  return res;
}
