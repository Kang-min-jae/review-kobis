// 모든 영화 카드의 "추천 N%" 배지 — 브라우저(affinity-store.ts)가 화면에 뜬 카드 ID와
// 내 평점을 한 번에 보내면 카드별 추천도를 돌려준다. 계산은 추천 행(/api/recommendations)과
// 같은 공식·재료(affinity-data.ts)를 써서, 같은 영화면 어느 행에서 보든 같은 숫자가 나온다.
// 협업 필터링(cf-data.ts)이 켜져 있고 근거가 충분한 영화만 CF를 섞고, 그 영화 ID를 cfBlended로 알려준다
// (점수 외에 다른 회원 정보는 돌려주지 않는다).

import { NextResponse } from "next/server";
import { movieIdToCd, sanitizeCategoryRatings, sanitizeRatings } from "../../_lib/rating-input";
import { buildTasteContext, loadQualityStats, loadTasteMetas, scoreAffinityWithCf } from "../../_lib/affinity-data";
import { createCfScorer } from "../../_lib/cf-data";

// 한 번에 계산할 카드 수 상한 — 브라우저는 이보다 작게 나눠 보낸다.
const MAX_TARGET_IDS = 300;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const movieIds = Array.isArray(input.movieIds)
    ? [...new Set(input.movieIds.filter((id): id is string => typeof id === "string"))].slice(0, MAX_TARGET_IDS)
    : [];
  if (movieIds.length === 0) {
    return NextResponse.json({ scores: {} });
  }

  const myRatings = sanitizeRatings(input.myRatings);
  if (myRatings.length === 0) {
    return NextResponse.json({ scores: {}, coldStart: true });
  }

  const targets = movieIds.flatMap((id) => {
    const cd = movieIdToCd(id);
    return cd ? [{ id, cd }] : [];
  });
  if (targets.length === 0) {
    return NextResponse.json({ scores: {}, coldStart: false });
  }

  try {
    const targetCds = targets.map((t) => t.cd);
    const [taste, metas, quality, cf] = await Promise.all([
      buildTasteContext(myRatings, sanitizeCategoryRatings(input.myCategoryRatings)),
      loadTasteMetas(targetCds),
      loadQualityStats(targetCds),
      createCfScorer(myRatings).catch(() => null),
    ]);
    // 평가한 작품의 정보를 하나도 확인하지 못했으면 취향을 알 수 없다 — 콜드 스타트와 같다.
    if (!taste.ctx.hasData) {
      return NextResponse.json({ scores: {}, coldStart: true });
    }

    await cf?.prefetch(targetCds);
    const scores: Record<string, number> = {};
    const cfBlended: string[] = [];
    for (const { id, cd } of targets) {
      // 이미 평가한 작품은 추천 대상이 아니다(카드엔 내 별점이 대신 보인다).
      if (taste.ratedCds.has(cd)) continue;
      const meta = metas.get(cd);
      if (meta?.tmdbId && taste.ratedTmdbIds.has(meta.tmdbId)) continue;
      const result = scoreAffinityWithCf(meta, taste.ctx, quality.get(cd), cd, cf);
      if (!result) continue;
      scores[id] = result.score;
      if (result.cfBlended) cfBlended.push(id);
    }
    return NextResponse.json(cfBlended.length > 0 ? { scores, cfBlended, coldStart: false } : { scores, coldStart: false });
  } catch (error) {
    console.warn("[affinity] 추천도 계산 실패:", error);
    return NextResponse.json({ scores: {} });
  }
}
