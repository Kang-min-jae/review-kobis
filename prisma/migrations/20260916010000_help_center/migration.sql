-- 1:1 문의·오류 제보 테이블
CREATE TABLE "Inquiry" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "category"   TEXT NOT NULL,
  "title"      TEXT NOT NULL,
  "content"    TEXT NOT NULL,
  "images"     JSONB NOT NULL DEFAULT '[]',
  "status"     TEXT NOT NULL DEFAULT '답변 대기',
  "adminReply" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Inquiry_userId_createdAt_idx" ON "Inquiry"("userId", "createdAt");

ALTER TABLE "Inquiry"
  ADD CONSTRAINT "Inquiry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 공지사항 테이블
CREATE TABLE "Notice" (
  "id"        TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "content"   TEXT,
  "isNew"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notice_createdAt_idx" ON "Notice"("createdAt");

-- 초기 공지 데이터
INSERT INTO "Notice" ("id", "type", "title", "content", "isNew", "createdAt") VALUES
  ('notice_1', '업데이트',   '추천 알고리즘이 더 정교해졌어요',             '여러분의 평점 패턴을 더 정밀하게 분석해 개인화 추천 품질을 높였습니다.',  true,  '2026-09-10 00:00:00'),
  ('notice_2', '신규 기능',  '베니스·베를린 영화제 수상작 투표 오픈',        '올해 수상작 중 내 최애를 직접 투표해 보세요.',                          false, '2026-09-01 00:00:00'),
  ('notice_3', '점검 안내',  '9/20(일) 새벽 2시~4시 서버 점검 예정',       '해당 시간 동안 서비스 이용이 일시 중단됩니다.',                          false, '2026-08-28 00:00:00'),
  ('notice_4', '업데이트',   '한줄평 글자수 제한이 늘어났어요',              '기존 100자에서 200자로 늘어났습니다.',                                  false, '2026-08-19 00:00:00');
