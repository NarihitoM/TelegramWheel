-- DropTable
DROP TABLE "Session";

-- CreateTable
CREATE TABLE "KnownMember" (
    "chatId" BIGINT NOT NULL,
    "userId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnownMember_pkey" PRIMARY KEY ("chatId","userId")
);

-- CreateTable
CREATE TABLE "Wheel" (
    "id" SERIAL NOT NULL,
    "chatId" BIGINT NOT NULL,
    "messageId" INTEGER,
    "ownerId" BIGINT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "teamCount" INTEGER,
    "teamSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wheel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WheelMember" (
    "wheelId" INTEGER NOT NULL,
    "userId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WheelMember_pkey" PRIMARY KEY ("wheelId","userId")
);

-- CreateIndex
CREATE INDEX "Wheel_chatId_idx" ON "Wheel"("chatId");

-- CreateIndex
CREATE INDEX "Wheel_ownerId_step_idx" ON "Wheel"("ownerId", "step");

-- AddForeignKey
ALTER TABLE "KnownMember" ADD CONSTRAINT "KnownMember_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wheel" ADD CONSTRAINT "Wheel_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelMember" ADD CONSTRAINT "WheelMember_wheelId_fkey" FOREIGN KEY ("wheelId") REFERENCES "Wheel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

