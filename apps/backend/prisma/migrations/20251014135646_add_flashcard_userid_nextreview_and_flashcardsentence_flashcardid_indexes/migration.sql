/*
  Warnings:

  - You are about to alter the column `vector` on the `RagEmbedding` table. The data in that column could be lost. The data in that column will be cast from `vector` to `Unsupported("vector")`.

*/
-- AlterTable
ALTER TABLE "RagEmbedding" ALTER COLUMN "vector" SET DATA TYPE vector;

-- CreateIndex
CREATE INDEX "Flashcard_userId_nextReview_idx" ON "Flashcard"("userId", "nextReview");

-- CreateIndex
CREATE INDEX "FlashcardSentence_flashcardId_idx" ON "FlashcardSentence"("flashcardId");
