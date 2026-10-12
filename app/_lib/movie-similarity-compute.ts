// "이 영화를 좋아한 사람들이 본" — 회원 평점 기반 아이템-아이템 협업 필터링(코사인 유사도) 계산.
//
// 좋아요 정의: 이 사이트의 "전체" 평점(CategoryRating, 0~10 — 한줄평 점수 또는 장문평/10)이
// 만점의 LIKE_THRESHOLD_RATIO(80%) 이상. 외부(TMDB·KOBIS) 평점은 쓰지 않는다.
//   L(A) = 영화 A를 좋아한 회원 집합
//   co   = |L(A) ∩ L(B)|
//   score = co / sqrt(|L(A)| · |L(B)|)
// co < MIN_CO_LIKES 인 쌍은 버리고, score 내림차순 → co 내림차순으로 영화마다 상위 TOP_N_PER_MOVIE개만
// MovieSimilarity에 저장한다. 회원 ID는 계산 중에만 쓰고 결과 테이블엔 집계값만 남는다.
//
// 앱(/api/cron/movie-similarity)과 스크립트(scripts/compute-movie-similarity.mts)가 같이 쓰도록
// DB 클라이언트를 인자로 받는다.

import type { PrismaClient } from "../generated/prisma/client";

export const RATING_MAX = 10;
export const LIKE_THRESHOLD_RATIO = 0.8;
export const LIKE_MIN_SCORE = RATING_MAX * LIKE_THRESHOLD_RATIO; // 8.0
export const MIN_CO_LIKES = 3;
export const TOP_N_PER_MOVIE = 20;

export async function recomputeMovieSimilarity(client: PrismaClient): Promise<{ pairs: number; movies: number }> {
  // 지우고 다시 넣는 걸 한 트랜잭션으로 묶어, 계산 도중 페이지가 빈 결과를 보지 않게 한다.
  // 시리즈(tmdb-tv-*)는 영화 추천과 섞지 않는다.
  const [, inserted] = await client.$transaction([
    client.$executeRaw`DELETE FROM "MovieSimilarity"`,
    client.$executeRaw`
      INSERT INTO "MovieSimilarity" ("movieCd", "similarMovieCd", "score", "coLikes", "updatedAt")
      WITH likes AS (
        SELECT DISTINCT "userId", "movieCd"
        FROM "CategoryRating"
        WHERE "category" = '전체' AND "score" >= ${LIKE_MIN_SCORE} AND "movieCd" NOT LIKE 'tmdb-tv-%'
      ),
      like_counts AS (
        SELECT "movieCd", COUNT(*)::float8 AS n FROM likes GROUP BY "movieCd"
      ),
      pairs AS (
        SELECT a."movieCd" AS m1, b."movieCd" AS m2, COUNT(*)::int AS co
        FROM likes a
        JOIN likes b ON a."userId" = b."userId" AND a."movieCd" <> b."movieCd"
        GROUP BY a."movieCd", b."movieCd"
        HAVING COUNT(*) >= ${MIN_CO_LIKES}
      ),
      scored AS (
        SELECT p.m1, p.m2, p.co, p.co / SQRT(c1.n * c2.n) AS score
        FROM pairs p
        JOIN like_counts c1 ON c1."movieCd" = p.m1
        JOIN like_counts c2 ON c2."movieCd" = p.m2
      ),
      ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY m1 ORDER BY score DESC, co DESC, m2) AS rn FROM scored
      )
      SELECT m1, m2, score, co, NOW() FROM ranked WHERE rn <= ${TOP_N_PER_MOVIE}
    `,
  ]);
  const movies = await client.movieSimilarity.groupBy({ by: ["movieCd"] }).then((rows) => rows.length);
  return { pairs: inserted, movies };
}
