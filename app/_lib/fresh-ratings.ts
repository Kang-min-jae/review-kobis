// 카드에 보이는 사이트 평균 별점을 항상 최신으로 맞춘다(서버 전용).
//
// 홈의 영화 행(박스오피스·Best·수상작·장르 등)은 "어떤 영화를 보여줄지"를 계산하는 데 외부 API·정렬이 필요해
// 15분~6시간 캐시한다. 그런데 평균 별점까지 그 캐시에 묶여 있으면 평점을 남겨도 홈 숫자가 늦게 바뀐다.
// 그래서 평균만 따로, 가벼운 DB 집계 한 번으로 캐시해 두고(RATING_AVERAGES_TAG), 평점·리뷰가 바뀌면
// 서버 액션이 이 태그만 지운다 — 무거운 행 목록은 그대로 두고 숫자만 바로 다시 읽는다.

import { unstable_cache } from "next/cache";
import { getBulkMovieRatingAverages } from "./review-data";
import { movieIdToCd } from "./rating-input";

export const RATING_AVERAGES_TAG = "rating-averages";

type AverageEntry = [string, { shortAvg: number | null; longAvg: number | null; shortCount: number }];

const getCachedAverages = unstable_cache(
  async (movieCds: string[]): Promise<AverageEntry[]> => [...(await getBulkMovieRatingAverages(movieCds)).entries()],
  ["rating-averages-v1"],
  { revalidate: 60 * 60, tags: [RATING_AVERAGES_TAG] },
);

type RatedRow = { id: string; shortAvg?: number | null; longAvg?: number | null; shortCount?: number | null };

// 행 카드들의 shortAvg·longAvg·shortCount를 최신 값으로 바꿔 돌려준다. 조회가 실패하면 원래 값 그대로.
export async function withFreshRatings<T extends RatedRow>(movies: T[]): Promise<T[]> {
  const cds = [...new Set(movies.map((m) => movieIdToCd(m.id)).filter((cd): cd is string => cd !== null))].sort();
  if (cds.length === 0) return movies;
  let averages: Map<string, AverageEntry[1]>;
  try {
    averages = new Map(await getCachedAverages(cds));
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
