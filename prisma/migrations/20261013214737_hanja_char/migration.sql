-- CreateTable
CREATE TABLE "HanjaChar" (
    "char" TEXT NOT NULL,
    "hangul" TEXT NOT NULL,
    "definition" TEXT,

    CONSTRAINT "HanjaChar_pkey" PRIMARY KEY ("char")
);
