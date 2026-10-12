-- 예고편 채널 규칙: 관리자가 배급사 공식 채널을 허용하거나 개인·모음 채널을 차단한다. 여러 번 실행해도 안전하다.
CREATE TABLE IF NOT EXISTS "TrailerChannelRule" (
    "channelKey" TEXT NOT NULL,
    "channelName" TEXT,
    "allowed" BOOLEAN NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrailerChannelRule_pkey" PRIMARY KEY ("channelKey")
);

-- 예전 캐시(업로드 채널 확인 전)는 지워서 다음 방문 때 채널을 확인하며 다시 받게 한다.
DELETE FROM "TrailerCache";
