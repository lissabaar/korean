-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "learnActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reviewActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "askRecognition" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAnonymous" BOOLEAN DEFAULT false;
