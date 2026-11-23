-- CreateTable
CREATE TABLE "WordAudio" (
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordAudio_pkey" PRIMARY KEY ("key")
);
