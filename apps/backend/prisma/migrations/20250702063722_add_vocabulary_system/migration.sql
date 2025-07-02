/*
  Warnings:

  - Added the required column `context` to the `WordInstance` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "VocabularyItem" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "frequency" INTEGER,
ADD COLUMN     "hskLevel" INTEGER,
ADD COLUMN     "isCustom" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WordInstance" ADD COLUMN     "context" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "messageId" INTEGER,
ALTER COLUMN "sectionId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "VocabularyItem_hanzi_idx" ON "VocabularyItem"("hanzi");

-- CreateIndex
CREATE INDEX "VocabularyItem_hskLevel_idx" ON "VocabularyItem"("hskLevel");

-- AddForeignKey
ALTER TABLE "WordInstance" ADD CONSTRAINT "WordInstance_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
