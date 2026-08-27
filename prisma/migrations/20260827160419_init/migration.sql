-- CreateTable
CREATE TABLE "CachedMovie" (
    "movieCd" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT,
    "posterUrl" TEXT,
    "overview" TEXT,
    "releaseDate" TEXT,
    "rereleaseDate" TEXT,
    "runtimeMinutes" INTEGER,
    "watchGrade" TEXT,
    "genreAlt" TEXT,
    "directorName" TEXT,
    "directorKmdbId" TEXT,
    "cast" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedMovie_pkey" PRIMARY KEY ("movieCd")
);

-- CreateTable
CREATE TABLE "CachedPerson" (
    "kmdbId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "filmography" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedPerson_pkey" PRIMARY KEY ("kmdbId")
);

-- CreateTable
CREATE TABLE "RankingSnapshot" (
    "id" SERIAL NOT NULL,
    "listType" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "movieCd" TEXT NOT NULL,
    "movieTitle" TEXT NOT NULL,
    "audiAcc" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RankingSnapshot_listType_syncedAt_idx" ON "RankingSnapshot"("listType", "syncedAt");
