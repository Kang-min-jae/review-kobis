-- CreateTable
CREATE TABLE "CategoryRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "movieCd" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoryRating_movieCd_category_idx" ON "CategoryRating"("movieCd", "category");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryRating_userId_movieCd_category_key" ON "CategoryRating"("userId", "movieCd", "category");

-- AddForeignKey
ALTER TABLE "CategoryRating" ADD CONSTRAINT "CategoryRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
