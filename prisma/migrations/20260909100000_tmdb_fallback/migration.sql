-- AlterTable
ALTER TABLE "CachedMovie" ADD COLUMN "tmdbId" TEXT;
ALTER TABLE "CachedMovie" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'kmdb';
ALTER TABLE "CachedMovie" ADD COLUMN "directorTmdbId" TEXT;

-- AlterTable
ALTER TABLE "PersonIdentityMapping" ADD COLUMN "tmdbId" TEXT;

-- AlterTable
ALTER TABLE "CachedPerson" ADD COLUMN "tmdbId" TEXT;
