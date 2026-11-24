-- 작품 노출 관리(성인물 자동 판정·관리자 숨김). 새 테이블만 추가한다 — 기존 데이터에 영향이 없고 여러 번 실행해도 안전하다.
-- 적용 전에도 사이트는 정상 동작한다(숨김·성인물로 표시된 작품이 없는 것으로 처리).

CREATE TABLE IF NOT EXISTS "MovieModeration" (
    "movieCd" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "moderatedBy" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "adult" BOOLEAN NOT NULL DEFAULT false,
    "adultReason" TEXT,
    "tmdbVoteCount" INTEGER,
    "checkedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovieModeration_pkey" PRIMARY KEY ("movieCd")
);

CREATE INDEX IF NOT EXISTS "MovieModeration_hidden_idx" ON "MovieModeration"("hidden");
CREATE INDEX IF NOT EXISTS "MovieModeration_adult_idx" ON "MovieModeration"("adult");
