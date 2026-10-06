-- CreateTable
CREATE TABLE "ExampleTranslation" (
    "text" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExampleTranslation_pkey" PRIMARY KEY ("text")
);
