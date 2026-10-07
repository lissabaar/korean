-- CreateTable
CREATE TABLE "KrdictEntry" (
    "targetCode" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "unit" TEXT,
    "partOfSpeech" TEXT,
    "level" TEXT,
    "origin" TEXT,
    "senses" JSONB NOT NULL,

    CONSTRAINT "KrdictEntry_pkey" PRIMARY KEY ("targetCode")
);

-- CreateIndex
CREATE INDEX "KrdictEntry_lemma_idx" ON "KrdictEntry"("lemma");
