-- CreateEnum
CREATE TYPE "VoteType" AS ENUM ('LIKE', 'DISLIKE');

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "dislikeCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ReviewLike" ADD COLUMN "type" "VoteType" NOT NULL DEFAULT 'LIKE';
