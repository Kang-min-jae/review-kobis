-- 회원가입 때 적는 "비밀번호 찾기용 이메일"(선택).
-- 새 테이블만 추가하고 재설정 코드 표의 외래 키 하나를 지운다 — 기존 데이터는 그대로이고, 여러 번 실행해도 안전하다.

CREATE TABLE IF NOT EXISTS "RecoveryEmail" (
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryEmail_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RecoveryEmail_email_key" ON "RecoveryEmail"("email");

DO $$ BEGIN
  ALTER TABLE "RecoveryEmail" ADD CONSTRAINT "RecoveryEmail_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 재설정 코드는 비밀번호 찾기용 이메일로도 보내므로 User.email 외래 키를 없앤다.
ALTER TABLE "PasswordResetCode" DROP CONSTRAINT IF EXISTS "PasswordResetCode_email_fkey";
