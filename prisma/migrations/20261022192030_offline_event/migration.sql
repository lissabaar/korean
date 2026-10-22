-- CreateTable
CREATE TABLE "OfflineEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfflineEvent_userId_idx" ON "OfflineEvent"("userId");
