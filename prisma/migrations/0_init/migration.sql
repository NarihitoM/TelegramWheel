-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Chat" (
    "id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "addedById" BIGINT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastWheelAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Spin" (
    "id" SERIAL NOT NULL,
    "chatId" BIGINT NOT NULL,
    "requestedById" BIGINT NOT NULL,
    "teamCount" INTEGER NOT NULL,
    "teamSize" INTEGER NOT NULL,
    "teams" JSONB NOT NULL,
    "leftovers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Spin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_key_key" ON "Session"("key");

-- CreateIndex
CREATE INDEX "Spin_chatId_idx" ON "Spin"("chatId");

-- AddForeignKey
ALTER TABLE "Spin" ADD CONSTRAINT "Spin_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

