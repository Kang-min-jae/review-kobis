-- 회원가입 약관 동의 기록 (TermsConsent)
CREATE TABLE IF NOT EXISTS "TermsConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "marketingUpdatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TermsConsent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TermsConsent_userId_key" ON "TermsConsent"("userId");

DO $$ BEGIN
  ALTER TABLE "TermsConsent" ADD CONSTRAINT "TermsConsent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
