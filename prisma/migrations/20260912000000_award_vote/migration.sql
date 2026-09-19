-- CreateTable
CREATE TABLE "AwardVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "festival" TEXT NOT NULL,
    "awardCategory" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "movieTitle" TEXT NOT NULL,
    "posterUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AwardVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AwardVote_userId_festival_awardCategory_key" ON "AwardVote"("userId", "festival", "awardCategory");

-- CreateIndex
CREATE INDEX "AwardVote_festival_awardCategory_idx" ON "AwardVote"("festival", "awardCategory");

-- AddForeignKey
ALTER TABLE "AwardVote" ADD CONSTRAINT "AwardVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
