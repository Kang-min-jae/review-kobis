-- 관리자가 직접 추가하는 공식 예고편. 새 테이블만 추가한다 — 기존 데이터에 영향이 없고 여러 번 실행해도 안전하다.
-- 적용 전에도 사이트는 정상 동작한다(직접 추가한 예고편이 없는 것으로 처리).

CREATE TABLE IF NOT EXISTS "ManualTrailer" (
    "movieCd" TEXT NOT NULL,
    "videoKey" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Trailer',
    "channelName" TEXT,
    "channelKey" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualTrailer_pkey" PRIMARY KEY ("movieCd", "videoKey")
);
