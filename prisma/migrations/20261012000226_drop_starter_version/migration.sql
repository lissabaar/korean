-- The starter categories are added to accounts with no words instead of being
-- tracked by version (owner's call); the column added just before goes.
ALTER TABLE "user" DROP COLUMN "starterVersion";
