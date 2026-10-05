-- CreateEnum
CREATE TYPE "Lang" AS ENUM ('KO', 'ES', 'EN', 'RU');

-- CreateEnum
CREATE TYPE "Register" AS ENUM ('NEUTRAL', 'FORMAL', 'POLITE', 'CASUAL', 'HONORIFIC', 'HUMBLE', 'WRITTEN', 'SLANG');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('KRDICT', 'STDICT', 'OPENDICT', 'AI', 'USER');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('SYNONYM', 'ANTONYM', 'HONORIFIC_OF', 'HUMBLE_OF', 'SHARES_HANJA', 'CONFUSABLE');

-- CreateEnum
CREATE TYPE "MaterialKind" AS ENUM ('TEXT', 'IMAGE', 'GENERATED');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('RECOGNITION', 'RECALL', 'REGISTER');

-- CreateEnum
CREATE TYPE "Phase" AS ENUM ('LEARNING', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('CHOICE', 'TYPING');

-- CreateEnum
CREATE TYPE "CardState" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING');

-- CreateEnum
CREATE TYPE "Rating" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "explanationLang" "Lang" NOT NULL DEFAULT 'EN',
    "desiredRetention" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "hideTranslationAfterStability" DOUBLE PRECISION DEFAULT 60,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "language" "Lang" NOT NULL,
    "reading" TEXT,
    "partOfSpeech" TEXT,
    "level" TEXT,
    "originalForm" TEXT,
    "register" "Register",
    "note" TEXT,
    "krdictTargetCode" TEXT,
    "source" "Source" NOT NULL DEFAULT 'KRDICT',
    "materialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sense" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "definitionTarget" TEXT,
    "definitionKnown" TEXT,
    "translation" TEXT,
    "contextNote" TEXT,
    "definitionSource" "Source" NOT NULL DEFAULT 'KRDICT',

    CONSTRAINT "Sense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Example" (
    "id" TEXT NOT NULL,
    "senseId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "translation" TEXT,
    "source" "Source" NOT NULL DEFAULT 'KRDICT',

    CONSTRAINT "Example_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryRelation" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "type" "RelationType" NOT NULL,
    "distinction" TEXT,
    "source" "Source" NOT NULL DEFAULT 'AI',

    CONSTRAINT "EntryRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "language" "Lang" NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryCategory" (
    "entryId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "assignedByAi" BOOLEAN NOT NULL DEFAULT false,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EntryCategory_pkey" PRIMARY KEY ("entryId","categoryId")
);

-- CreateTable
CREATE TABLE "SourceMaterial" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "MaterialKind" NOT NULL,
    "title" TEXT,
    "rawText" TEXT,
    "imageUrl" TEXT,
    "language" "Lang" NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "senseId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "phase" "Phase" NOT NULL DEFAULT 'LEARNING',
    "learningStreak" INTEGER NOT NULL DEFAULT 0,
    "graduatedAt" TIMESTAMP(3),
    "due" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elapsedDays" INTEGER NOT NULL DEFAULT 0,
    "scheduledDays" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "state" "CardState" NOT NULL DEFAULT 'NEW',
    "lastReview" TIMESTAMP(3),
    "translationHiddenAt" TIMESTAMP(3),
    "suspended" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "rating" "Rating" NOT NULL,
    "state" "CardState" NOT NULL,
    "due" TIMESTAMP(3) NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "elapsedDays" INTEGER NOT NULL,
    "scheduledDays" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "translationShown" BOOLEAN NOT NULL DEFAULT true,
    "exercise" "ExerciseType" NOT NULL DEFAULT 'TYPING',

    CONSTRAINT "ReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "Entry_userId_language_idx" ON "Entry"("userId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_userId_language_lemma_originalForm_key" ON "Entry"("userId", "language", "lemma", "originalForm");

-- CreateIndex
CREATE INDEX "Sense_entryId_idx" ON "Sense"("entryId");

-- CreateIndex
CREATE INDEX "Example_senseId_idx" ON "Example"("senseId");

-- CreateIndex
CREATE INDEX "EntryRelation_toId_idx" ON "EntryRelation"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "EntryRelation_fromId_toId_type_key" ON "EntryRelation"("fromId", "toId", "type");

-- CreateIndex
CREATE INDEX "Category_userId_language_idx" ON "Category"("userId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_language_name_key" ON "Category"("userId", "language", "name");

-- CreateIndex
CREATE INDEX "EntryCategory_categoryId_idx" ON "EntryCategory"("categoryId");

-- CreateIndex
CREATE INDEX "SourceMaterial_userId_idx" ON "SourceMaterial"("userId");

-- CreateIndex
CREATE INDEX "Card_userId_due_idx" ON "Card"("userId", "due");

-- CreateIndex
CREATE UNIQUE INDEX "Card_senseId_direction_key" ON "Card"("senseId", "direction");

-- CreateIndex
CREATE INDEX "ReviewLog_cardId_reviewedAt_idx" ON "ReviewLog"("cardId", "reviewedAt");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "SourceMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sense" ADD CONSTRAINT "Sense_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Example" ADD CONSTRAINT "Example_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "Sense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryRelation" ADD CONSTRAINT "EntryRelation_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryRelation" ADD CONSTRAINT "EntryRelation_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryCategory" ADD CONSTRAINT "EntryCategory_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryCategory" ADD CONSTRAINT "EntryCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMaterial" ADD CONSTRAINT "SourceMaterial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "Sense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
