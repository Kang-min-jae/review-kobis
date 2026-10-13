-- 협업 필터링(CF) "추천 N%" 하이브리드: 영화 간 유사도 + 전역 통계 테이블.
-- 새 테이블만 추가한다 — 기존 데이터와 화면에 영향이 없고, 여러 번 실행해도 안전하다.
-- 적용 전에도 사이트는 정상 동작한다(CF는 꺼진 것으로 처리).

CREATE TABLE IF NOT EXISTS "MovieCfSimilarity" (
    "movieCd" TEXT NOT NULL,
    "neighborCd" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "coRaters" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovieCfSimilarity_pkey" PRIMARY KEY ("movieCd", "neighborCd")
);
CREATE INDEX IF NOT EXISTS "MovieCfSimilarity_movieCd_similarity_idx" ON "MovieCfSimilarity"("movieCd", "similarity");

CREATE TABLE IF NOT EXISTS "CfStats" (
    "id" TEXT NOT NULL,
    "totalRatings" INTEGER NOT NULL,
    "ratingUsers" INTEGER NOT NULL,
    "pairCount" INTEGER NOT NULL DEFAULT 0,
    "avgCoRaters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cursor" TEXT,
    "passStartedAt" TIMESTAMP(3),
    "lastPassAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CfStats_pkey" PRIMARY KEY ("id")
);
