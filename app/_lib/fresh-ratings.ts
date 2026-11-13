// 카드에 보이는 사이트 평균 별점을 항상 최신으로 맞춘다(서버 전용).
//
// 홈의 영화 행(박스오피스·Best·수상작·장르 등)은 "어떤 영화를 보여줄지"를 계산하는 데 외부 API·정렬이 필요해
// 15분~6시간 캐시한다. 그런데 평균 별점까지 그 캐시에 묶여 있으면 평점을 남겨도 홈 숫자가 늦게 바뀐다.
// 그래서 평균만 따로 캐시해 두고(RATING_AVERAGES_TAG), 평점·리뷰가 바뀌면 서버 액션이 이 태그만 지운다 —
// 무거운 행 목록은 그대로 두고 숫자만 바로 다시 읽는다.
//
// 캐시 읽기·쓰기를 줄이려고 "평점이 있는 모든 영화의 평균"을 한 항목으로 캐시하고, 한 요청 안에서는
// React cache로 한 번만 읽는다(홈 한 번에 행이 20개여도 캐시 읽기 1번, 평점이 바뀌면 쓰기 1번).
// 평점 있는 영화가 아주 많아져 한 항목이 너무 커지면 행마다 따로 조회하는 방식으로 넘어간다.

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { getBulkMovieRatingAverages } from "./review-data";
import { movieIdToCd } from "./rating-input";

export const RATING_AVERAGES_TAG = "rating-averages";

type Averages = { shortAvg: number | null; longAvg: number | null; shortCount: number };
type AverageEntry = [string, Averages];

// 한 캐시 항목에 담을 최대 영화 수 — 항목당 60바이트 안팎이라 1MB 안쪽(캐시 항목 한도 2MB).
const MAX_MOVIES_IN_ONE_ENTRY = 15_000;

const loadAllAverages = unstable_cache(
  async (): Promise<AverageEntry[] | null> => {
    const rows = await db.review.groupBy({
      by: ["movieCd", "type"],
      where: { category: "전체" },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const map = new Map<string, Averages>();
    for (const row of rows) {
      const entry = map.get(row.movieCd) ?? { shortAvg: null, longAvg: null, shortCount: 0 };
      if (row.type === "SHORT") {
        entry.shortAvg = row._avg.rating ?? null;
        entry.shortCount = row._count._all;
      } else if (row.type === "LONG") entry.longAvg = row._avg.rating ?? null;
      map.set(row.movieCd, entry);
    }
    return map.size > MAX_MOVIES_IN_ONE_ENTRY ? null : [...map.entries()];
  },
  ["rating-averages-all-v1"],
  // 평점이 바뀌면 캐시 태그로 바로 지운다(review-actions.ts). 시간 주기는 길게 — 이 값이 공용 페이지를 다시 만드는 주기를 짧게 끌어내린다.
  { revalidate: 60 * 60 * 24 * 7, tags: [RATING_AVERAGES_TAG] },
);

// 한 요청(페이지 렌더) 안에서는 한 번만 읽는다.
const getAllAverages = cache(async (): Promise<Map<string, Averages> | null> => {
  const entries = await loadAllAverages();
  return entries ? new Map(entries) : null;
});

// 평점 있는 영화가 너무 많을 때만 쓰는 행 단위 캐시.
const getRowAverages = unstable_cache(
  async (movieCds: string[]): Promise<AverageEntry[]> => [...(await getBulkMovieRatingAverages(movieCds)).entries()],
  ["rating-averages-v1"],
  { revalidate: 60 * 60 * 24 * 7, tags: [RATING_AVERAGES_TAG] },
);

type RatedRow = { id: string; shortAvg?: number | null; longAvg?: number | null; shortCount?: number | null };

// 행 카드들의 shortAvg·longAvg·shortCount를 최신 값으로 바꿔 돌려준다. 조회가 실패하면 원래 값 그대로.
export async function withFreshRatings<T extends RatedRow>(movies: T[]): Promise<T[]> {
  const cds = [...new Set(movies.map((m) => movieIdToCd(m.id)).filter((cd): cd is string => cd !== null))].sort();
  if (cds.length === 0) return movies;
  let averages: Map<string, Averages>;
  try {
    averages = (await getAllAverages()) ?? new Map(await getRowAverages(cds));
  } catch (error) {
    console.warn("[fresh-ratings] 평균 별점을 다시 읽지 못했습니다:", error instanceof Error ? error.message : error);
    return movies;
  }
  return movies.map((m) => {
    const cd = movieIdToCd(m.id);
    if (!cd) return m;
    const a = averages.get(cd);
    return { ...m, shortAvg: a?.shortAvg ?? null, longAvg: a?.longAvg ?? null, shortCount: a?.shortCount ?? null };
  });
}
