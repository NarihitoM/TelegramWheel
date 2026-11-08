-- CreateTable
CREATE TABLE "Avatar" (
    "userId" BIGINT NOT NULL,
    "photoId" TEXT,
    "data" BYTEA,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("userId")
);
