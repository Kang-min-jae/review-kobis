-- CreateTable
CREATE TABLE "PersonIdentityMapping" (
    "id" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kmdbId" TEXT,
    "koficPeopleCd" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonIdentityMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonIdentityMapping_personName_role_key" ON "PersonIdentityMapping"("personName", "role");
