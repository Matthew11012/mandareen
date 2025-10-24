/*
  Warnings:

  - You are about to alter the column `vector` on the `RagEmbedding` table. The data in that column could be lost. The data in that column will be cast from `vector` to `Unsupported("vector")`.

*/
-- DropIndex
DROP INDEX "public"."CurriculumProgress_userId_status_updatedAt_idx";

-- DropIndex
DROP INDEX "public"."LessonProgress_userId_finishedAt_idx";

-- AlterTable
ALTER TABLE "RagEmbedding" ALTER COLUMN "vector" SET DATA TYPE vector;

-- AlterTable
ALTER TABLE "VocabularyItem" ADD COLUMN     "pinyin_search" TEXT;

-- CreateIndex
CREATE INDEX "VocabularyItem_pinyin_search_idx" ON "VocabularyItem"("pinyin_search");
