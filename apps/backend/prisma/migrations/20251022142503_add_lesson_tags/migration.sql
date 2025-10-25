/*
  Warnings:

  - You are about to alter the column `vector` on the `RagEmbedding` table. The data in that column could be lost. The data in that column will be cast from `vector` to `Unsupported("vector")`.

*/
-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "RagEmbedding" ALTER COLUMN "vector" SET DATA TYPE vector;

-- CreateIndex
CREATE INDEX "Lesson_tags_idx" ON "Lesson" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "Lesson_createdAt_idx" ON "Lesson"("createdAt");

-- CreateIndex
CREATE INDEX "Lesson_createdBy_idx" ON "Lesson"("createdBy");
