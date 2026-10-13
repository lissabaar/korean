-- AlterEnum
ALTER TYPE "Phase" ADD VALUE 'MASTERED';

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "masteredAt" TIMESTAMP(3),
ADD COLUMN     "reviewStreak" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "masteredAfterDays" INTEGER NOT NULL DEFAULT 56;
