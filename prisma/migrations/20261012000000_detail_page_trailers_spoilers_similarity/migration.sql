-- 영화 상세(평점) 페이지 개편: 공식 예고편, 스포일러 표시·신고, "이 영화를 좋아한 사람들이 본"
-- 모든 변경은 기본값이 있는 컬럼 추가/새 테이블이라 기존 데이터와 화면에 영향이 없다. 여러 번 실행해도 안전하다.

-- 1) 회원 설정: 스포일러 항상 보기 (기본 꺼짐)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "alwaysShowSpoilers" BOOLEAN NOT NULL DEFAULT false;

-- 2) 리뷰 스포일러 표시 출처
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "spoilerFlagSource" TEXT;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "spoilerFlaggedAt" TIMESTAMP(3);
-- 예전엔 등록할 때 키워드로 자동 감지해 hasSpoiler를 켰다 — 그 리뷰들은 출처를 "keyword"로 남긴다.
UPDATE "Review" SET "spoilerFlagSource" = 'keyword' WHERE "hasSpoiler" = true AND "spoilerFlagSource" IS NULL;

-- 3) 스포일러 신고 (1인 1리뷰 1회)
CREATE TABLE IF NOT EXISTS "SpoilerReport" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpoilerReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpoilerReport_reviewId_userId_key" ON "SpoilerReport"("reviewId", "userId");
DO $$ BEGIN
  ALTER TABLE "SpoilerReport" ADD CONSTRAINT "SpoilerReport_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "SpoilerReport" ADD CONSTRAINT "SpoilerReport_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4) 관리자가 차단한 예고편 영상
CREATE TABLE IF NOT EXISTS "BlockedVideoKey" (
    "videoKey" TEXT NOT NULL,
    "movieCd" TEXT,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedVideoKey_pkey" PRIMARY KEY ("videoKey")
);

-- 5) TMDB 예고편 목록 캐시 (영화당 24시간)
CREATE TABLE IF NOT EXISTS "TrailerCache" (
    "tmdbId" TEXT NOT NULL,
    "videos" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrailerCache_pkey" PRIMARY KEY ("tmdbId")
);

-- 6) 영화 간 유사도 (회원 평점 기반, 영화당 상위 20개)
CREATE TABLE IF NOT EXISTS "MovieSimilarity" (
    "movieCd" TEXT NOT NULL,
    "similarMovieCd" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "coLikes" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovieSimilarity_pkey" PRIMARY KEY ("movieCd", "similarMovieCd")
);
CREATE INDEX IF NOT EXISTS "MovieSimilarity_movieCd_score_idx" ON "MovieSimilarity"("movieCd", "score");
