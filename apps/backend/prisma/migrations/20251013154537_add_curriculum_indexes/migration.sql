/*
  Warnings:

  - You are about to alter the column `vector` on the `RagEmbedding` table. The data in that column could be lost. The data in that column will be cast from `vector` to `Unsupported("vector")`.

*/
-- AlterTable
ALTER TABLE "RagEmbedding" ALTER COLUMN "vector" SET DATA TYPE vector;

-- CreateIndex
CREATE INDEX "CurriculumLesson_unitId_order_idx" ON "CurriculumLesson"("unitId", "order");

-- CreateIndex
CREATE INDEX "CurriculumProgress_userId_status_idx" ON "CurriculumProgress"("userId", "status");

-- CreateIndex
CREATE INDEX "CurriculumUnit_ragSourceId_order_idx" ON "CurriculumUnit"("ragSourceId", "order");
