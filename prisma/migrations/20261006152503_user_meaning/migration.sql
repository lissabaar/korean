-- AlterTable
ALTER TABLE "Sense" ADD COLUMN     "userMeaning" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "myMeaningFirst" BOOLEAN NOT NULL DEFAULT false;

-- Until now the user's own meaning replaced the English translation. Move
-- the user-written ones (recognisable by Cyrillic) into userMeaning; their
-- English translation is restored from the dictionary / AI by the app
-- ("Fill in English meanings").
UPDATE "Sense"
SET "userMeaning" = "translation", "translation" = NULL
WHERE "translation" ~ '[А-Яа-яЁё]';
