-- AlterTable
ALTER TABLE "user" ALTER COLUMN "learningGoal" SET DEFAULT 5;

-- Nobody had picked a goal yet (the setting is new): move everyone to the new default.
UPDATE "user" SET "learningGoal" = 5 WHERE "learningGoal" = 3;
