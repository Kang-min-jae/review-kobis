-- User 모델에 role 필드 추가 (관리자 구분용)
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'USER';
