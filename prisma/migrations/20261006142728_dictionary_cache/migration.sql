-- CreateTable
CREATE TABLE "DictionaryCache" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DictionaryCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "GeneratedExample" (
    "id" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "translation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DictionaryUsage" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DictionaryUsage_pkey" PRIMARY KEY ("userId","day")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedExample_lemma_meaning_key" ON "GeneratedExample"("lemma", "meaning");

-- AddForeignKey
ALTER TABLE "DictionaryUsage" ADD CONSTRAINT "DictionaryUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
