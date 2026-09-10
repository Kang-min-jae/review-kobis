-- CreateTable
CREATE TABLE "RereleaseClassification" (
    "movieCd" TEXT NOT NULL,
    "movieTitle" TEXT NOT NULL,
    "isRerelease" BOOLEAN NOT NULL,
    "originalYear" TEXT,
    "rereleaseDate" TEXT,
    "audiAcc" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'classified',
    "source" TEXT NOT NULL,
    "manualConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RereleaseClassification_pkey" PRIMARY KEY ("movieCd")
);

-- CreateIndex
CREATE INDEX "RereleaseClassification_isRerelease_status_idx" ON "RereleaseClassification"("isRerelease", "status");
