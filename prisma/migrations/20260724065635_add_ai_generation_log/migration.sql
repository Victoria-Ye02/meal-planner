-- CreateTable
CREATE TABLE "AiGenerationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiGenerationLog_userId_createdAt_idx" ON "AiGenerationLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiGenerationLog" ADD CONSTRAINT "AiGenerationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
