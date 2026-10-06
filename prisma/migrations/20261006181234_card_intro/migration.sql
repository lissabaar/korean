-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "introducedAt" TIMESTAMP(3),
ADD COLUMN     "snoozedUntil" TIMESTAMP(3);

-- Words already being drilled or reviewed have been seen: no intro for them.
UPDATE "Card" SET "introducedAt" = NOW() WHERE "phase" = 'SCHEDULED' OR "learningStreak" > 0;
