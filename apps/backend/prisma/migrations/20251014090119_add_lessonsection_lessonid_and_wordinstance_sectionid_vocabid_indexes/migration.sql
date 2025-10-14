/*
  Warnings:

  - You are about to alter the column `vector` on the `RagEmbedding` table. The data in that column could be lost. The data in that column will be cast from `vector` to `Unsupported("vector")`.

*/
-- AlterTable
ALTER TABLE "RagEmbedding" ALTER COLUMN "vector" SET DATA TYPE vector;

-- CreateIndex
CREATE INDEX "LessonSection_lessonId_idx" ON "LessonSection"("lessonId");

-- CreateIndex
CREATE INDEX "WordInstance_sectionId_idx" ON "WordInstance"("sectionId");

-- CreateIndex
CREATE INDEX "WordInstance_vocabId_idx" ON "WordInstance"("vocabId");
