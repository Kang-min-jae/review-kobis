-- CreateEnum
CREATE TYPE "PersonFilmographyOverrideAction" AS ENUM ('EXCLUDE', 'INCLUDE');

-- CreateTable
CREATE TABLE "PersonFilmographyOverride" (
    "id" TEXT NOT NULL,
    "personKmdbId" TEXT NOT NULL,
    "movieCd" TEXT NOT NULL,
    "action" "PersonFilmographyOverrideAction" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonFilmographyOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonFilmographyOverride_personKmdbId_idx" ON "PersonFilmographyOverride"("personKmdbId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonFilmographyOverride_personKmdbId_movieCd_key" ON "PersonFilmographyOverride"("personKmdbId", "movieCd");
