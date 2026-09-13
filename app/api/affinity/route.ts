import { NextResponse } from "next/server";
import { db } from "../../_lib/db";
import { splitGenres } from "../../_lib/movie-rows";

const CAT_KEYS = ["연출", "연기", "각본", "음악", "편집"] as const;
type CatKey = (typeof CAT_KEYS)[number];
type CatVec = Record<CatKey, number>;

type IncomingRating = { movieId: string; rating: number };
type RequestBody = {
  movieIds: string[];
  myRatings: IncomingRating[];
  myCategoryRatings: unknown[];
};

// 베이지안 스무딩 파라미터
const BAYES_C = 20;
const BAYES_PRIOR = 6.5;
// 고평가 기준점 (0~10 스케일)
const HIGH_RATING_THRESHOLD = 7.0;

// prefixed movieId → CachedMovie.movieCd / CategoryRating.movieCd
// kobis-12345 → "12345", tmdb-12345 → "tmdb-12345", tmdb-tv-123 → "tmdb-tv-123"
function idToCd(movieId: string): string | null {
  if (/^kobis-(\d+)$/.test(movieId)) return movieId.slice("kobis-".length);
  if (movieId.startsWith("tmdb-")) return movieId;
  return null;
}

function zeroCatVec(): CatVec {
  return { 연출: 0, 연기: 0, 각본: 0, 음악: 0, 편집: 0 };
}

function cosineSimilarity(a: CatVec, b: CatVec): number {
  let dot = 0, normA = 0, normB = 0;
  for (const k of CAT_KEYS) {
    dot += a[k] * b[k];
    normA += a[k] * a[k];
    normB += b[k] * b[k];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { movieIds, myRatings = [] } = body;
  if (!Array.isArray(movieIds) || movieIds.length === 0) {
    return NextResponse.json({ scores: {} });
  }

  if (myRatings.length === 0) {
    return NextResponse.json({ scores: {}, coldStart: true });
  }

  // ── 1. ID → DB 키 변환 ──────────────────────────────────────────────
  const ratedEntries = myRatings
    .map((r) => ({ movieId: r.movieId, rating: r.rating, cd: idToCd(r.movieId) }))
    .filter((r): r is { movieId: string; rating: number; cd: string } => r.cd !== null);

  const targetEntries = movieIds
    .map((id) => ({ id, cd: idToCd(id) }))
    .filter((e): e is { id: string; cd: string } => e.cd !== null);

  if (targetEntries.length === 0) {
    return NextResponse.json({ scores: {}, coldStart: false });
  }

  const ratedCds = ratedEntries.map((r) => r.cd);
  const targetCds = targetEntries.map((e) => e.cd);
  const allCds = Array.from(new Set([...ratedCds, ...targetCds]));

  // ── 2. 메타 및 커뮤니티 평점 일괄 조회 ─────────────────────────────
  const [metaRows, catRows, overallRows] = await Promise.all([
    db.cachedMovie.findMany({
      where: { movieCd: { in: allCds } },
      select: { movieCd: true, genreAlt: true },
    }),
    // 5개 카테고리 항목별 커뮤니티 평균
    db.categoryRating.groupBy({
      by: ["movieCd", "category"],
      where: { movieCd: { in: allCds }, category: { in: [...CAT_KEYS] } },
      _avg: { score: true },
      _count: { score: true },
    }),
    // 전체 평점 — 베이지안 품질 점수용
    db.categoryRating.groupBy({
      by: ["movieCd"],
      where: { movieCd: { in: allCds }, category: "전체" },
      _avg: { score: true },
      _count: { score: true },
    }),
  ]);

  const metaMap = new Map(metaRows.map((m) => [m.movieCd, m]));

  // movieCd → CatKey → { avg, count }
  const catMap = new Map<string, Map<CatKey, { avg: number; count: number }>>();
  for (const row of catRows) {
    if (!catMap.has(row.movieCd)) catMap.set(row.movieCd, new Map());
    catMap.get(row.movieCd)!.set(row.category as CatKey, {
      avg: row._avg.score ?? 0,
      count: row._count.score,
    });
  }

  // movieCd → { avg, count }
  const overallMap = new Map(
    overallRows.map((r) => [r.movieCd, { avg: r._avg.score ?? 0, count: r._count.score }])
  );

  // ── 3. 장르 가중 선호도 (상위 5개) ──────────────────────────────────
  const genreWeights = new Map<string, number>();
  for (const { cd, rating } of ratedEntries) {
    const meta = metaMap.get(cd);
    if (!meta) continue;
    const w = rating / 10;
    for (const g of splitGenres(meta.genreAlt)) {
      genreWeights.set(g, (genreWeights.get(g) ?? 0) + w);
    }
  }
  const preferredGenres = new Set(
    [...genreWeights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g)
  );

  // ── 4. 커뮤니티 카테고리 프로파일 (전체 대비 편차 벡터) ────────────────
  function getMovieCatProfile(cd: string): CatVec {
    const vec = zeroCatVec();
    const cats = catMap.get(cd);
    if (!cats) return vec;
    const overallAvg = overallMap.get(cd)?.avg ?? BAYES_PRIOR;
    for (const k of CAT_KEYS) {
      const entry = cats.get(k);
      if (entry && entry.count >= 3) {
        vec[k] = entry.avg - overallAvg;
      }
    }
    return vec;
  }

  // ── 5. 사용자 암묵적 카테고리 선호 벡터 ─────────────────────────────
  const userCatVec = zeroCatVec();
  let totalCatWeight = 0;
  for (const { cd, rating } of ratedEntries) {
    if (rating < HIGH_RATING_THRESHOLD) continue;
    const weight = (rating - HIGH_RATING_THRESHOLD) / (10 - HIGH_RATING_THRESHOLD);
    const profile = getMovieCatProfile(cd);
    for (const k of CAT_KEYS) {
      userCatVec[k] += weight * profile[k];
    }
    totalCatWeight += weight;
  }
  if (totalCatWeight > 0) {
    for (const k of CAT_KEYS) userCatVec[k] /= totalCatWeight;
  }

  const hasUserCatSignal = CAT_KEYS.some((k) => userCatVec[k] !== 0);

  // ── 6. 각 대상 영화 점수 계산 ────────────────────────────────────────
  const scores: Record<string, number> = {};

  for (const { id, cd } of targetEntries) {
    const meta = metaMap.get(cd);

    // 6a. 장르 점수 — Simpson 오버랩 계수
    const allGenres = meta ? splitGenres(meta.genreAlt) : [];
    let genreScore = 0;
    if (allGenres.length > 0 && preferredGenres.size > 0) {
      const overlap = allGenres.filter((g) => preferredGenres.has(g)).length;
      genreScore = overlap / Math.min(preferredGenres.size, allGenres.length);
    }

    // 6b. 카테고리 코사인 유사도 → 0~1 정규화
    let catScore = 0;
    if (hasUserCatSignal) {
      const movieProfile = getMovieCatProfile(cd);
      const cosine = cosineSimilarity(userCatVec, movieProfile);
      catScore = (cosine + 1) / 2;
    }

    // 6c. 베이지안 품질 점수 (리뷰 수 보정, 단일 리뷰 이상도 인정)
    const overall = overallMap.get(cd);
    const bayesianQuality =
      overall && overall.count >= 1
        ? (overall.count * overall.avg + BAYES_C * BAYES_PRIOR) / (overall.count + BAYES_C) / 10
        : BAYES_PRIOR / 10;

    // 6d. 가중합 — 카테고리 신호가 없으면 장르+품질 fallback
    const total = hasUserCatSignal
      ? 0.35 * genreScore + 0.35 * catScore + 0.30 * bayesianQuality
      : 0.60 * genreScore + 0.40 * bayesianQuality;

    const percent = Math.round(total * 100);
    if (percent > 0) {
      scores[id] = Math.min(99, Math.max(1, percent));
    }
  }

  return NextResponse.json({ scores, coldStart: false });
}
