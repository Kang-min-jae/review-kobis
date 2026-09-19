// 추천도(%) 계산 공통 모듈 — /api/affinity와 /api/recommendations가 공유한다.
// 동일한 사용자 입력에 대해 모든 페이지에서 일관된 숫자를 표시하기 위해
// 장르·감독·배우 선호도와 커뮤니티 품질 점수를 하나의 공식으로 합산한다.

export interface AffinityContext {
  genreAvgRating: Map<string, number>;    // 장르 → 사용자 평균 평점 (0–10)
  directorAvgRating: Map<string, number>; // 감독 이름 → 사용자 평균 평점 (0–10)
  actorAvgRating: Map<string, number>;    // 배우 이름 → 사용자 평균 평점 (0–10)
  maxGenreAvg: number;
  maxDirectorAvg: number;
  maxActorAvg: number;
}

export interface RatedMovieForContext {
  rating: number;           // 0–10
  genres: string[];
  directorName: string | null;
  castNames: string[];      // 최대 5명
}

export function buildAffinityContext(ratedMovies: RatedMovieForContext[]): AffinityContext {
  const genreSum = new Map<string, { sum: number; count: number }>();
  const directorSum = new Map<string, { sum: number; count: number }>();
  const actorSum = new Map<string, { sum: number; count: number }>();

  for (const { rating, genres, directorName, castNames } of ratedMovies) {
    for (const g of genres) {
      const e = genreSum.get(g) ?? { sum: 0, count: 0 };
      e.sum += rating; e.count++;
      genreSum.set(g, e);
    }
    if (directorName) {
      const e = directorSum.get(directorName) ?? { sum: 0, count: 0 };
      e.sum += rating; e.count++;
      directorSum.set(directorName, e);
    }
    for (const name of castNames.slice(0, 5)) {
      const e = actorSum.get(name) ?? { sum: 0, count: 0 };
      e.sum += rating; e.count++;
      actorSum.set(name, e);
    }
  }

  const toAvgMap = (m: Map<string, { sum: number; count: number }>) =>
    new Map([...m.entries()].map(([k, { sum, count }]) => [k, sum / count]));

  const genreAvgRating = toAvgMap(genreSum);
  const directorAvgRating = toAvgMap(directorSum);
  const actorAvgRating = toAvgMap(actorSum);

  return {
    genreAvgRating,
    directorAvgRating,
    actorAvgRating,
    maxGenreAvg: genreAvgRating.size > 0 ? Math.max(...genreAvgRating.values()) : 10,
    maxDirectorAvg: directorAvgRating.size > 0 ? Math.max(...directorAvgRating.values()) : 10,
    maxActorAvg: actorAvgRating.size > 0 ? Math.max(...actorAvgRating.values()) : 10,
  };
}

// 커뮤니티 평균 평점 → 베이지안 보정 품질 점수 (0–1).
// 리뷰 수가 적을수록 사전 확률(6.5/10)로 끌어당겨 소표본 왜곡을 방지한다.
const BAYES_C = 20;
const BAYES_PRIOR = 6.5;

export function computeBayesianQuality(reviewAvg: number | null, reviewCount: number): number {
  if (reviewCount >= 1 && reviewAvg !== null) {
    return (reviewCount * reviewAvg + BAYES_C * BAYES_PRIOR) / (reviewCount + BAYES_C) / 10;
  }
  return BAYES_PRIOR / 10;
}

// 영화 한 편의 추천도(0–1) 계산.
// 장르·감독·배우 선호도(사용자 개인화)와 커뮤니티 품질 점수를 가중합한다.
// 반환값에 100을 곱한 뒤 Math.round + 1~99 클리핑 해서 "추천 N%"로 표시한다.
export function calculateMovieAffinity(
  movie: { genres: string[]; directorName?: string | null; castNames?: string[] },
  ctx: AffinityContext,
  bayesianQuality: number, // 0–1
): number {
  // 1. 장르 선호도: 매칭 장르들의 평균 선호도를 최고 선호 장르로 정규화 (0–1)
  let genreScore = 0;
  if (movie.genres.length > 0 && ctx.maxGenreAvg > 0) {
    const matched = movie.genres.filter((g) => ctx.genreAvgRating.has(g));
    if (matched.length > 0) {
      const avg = matched.reduce((s, g) => s + ctx.genreAvgRating.get(g)!, 0) / matched.length;
      genreScore = avg / ctx.maxGenreAvg;
    }
  }

  // 2. 감독 선호도: 이 영화의 감독을 이전에 몇 점으로 평가했는지 (0–1)
  let directorScore = 0;
  if (movie.directorName && ctx.maxDirectorAvg > 0) {
    const r = ctx.directorAvgRating.get(movie.directorName);
    if (r !== undefined) directorScore = r / ctx.maxDirectorAvg;
  }

  // 3. 배우 선호도: 출연진 중 가장 높은 개인화 점수 (0–1)
  let actorScore = 0;
  if (movie.castNames && movie.castNames.length > 0 && ctx.maxActorAvg > 0) {
    const matched = movie.castNames
      .map((n) => ctx.actorAvgRating.get(n))
      .filter((r): r is number => r !== undefined);
    if (matched.length > 0) actorScore = Math.max(...matched) / ctx.maxActorAvg;
  }

  const hasGenre = genreScore > 0;
  // 감독(60%)+배우(40%) 합산 인물 점수
  const personScore =
    directorScore > 0 && actorScore > 0
      ? 0.6 * directorScore + 0.4 * actorScore
      : directorScore > 0
        ? directorScore
        : actorScore;
  const hasPerson = personScore > 0;

  // 4. 가중합 — 신호가 있는 요소만 반영
  if (hasGenre && hasPerson) {
    // 장르 40% + 인물 20% + 품질 40%
    return 0.40 * genreScore + 0.20 * personScore + 0.40 * bayesianQuality;
  }
  if (hasGenre) {
    return 0.60 * genreScore + 0.40 * bayesianQuality;
  }
  if (hasPerson) {
    return 0.60 * personScore + 0.40 * bayesianQuality;
  }
  return bayesianQuality;
}
