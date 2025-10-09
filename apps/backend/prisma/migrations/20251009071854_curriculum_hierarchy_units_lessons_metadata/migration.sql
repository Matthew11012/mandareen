/*
  Warnings:

  - You are about to alter the column `vector` on the `RagEmbedding` table. The data in that column could be lost. The data in that column will be cast from `vector(1536)` to `Unsupported("vector")`.
  - A unique constraint covering the columns `[unitId,title]` on the table `CurriculumLesson` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ragSourceId,title]` on the table `CurriculumUnit` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."CurriculumUnit_ragSourceId_key";

-- AlterTable
ALTER TABLE "CurriculumLesson" ADD COLUMN     "metadata" JSONB,
ALTER COLUMN "ragSectionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CurriculumUnit" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "RagEmbedding" ALTER COLUMN "vector" SET DATA TYPE vector;

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumLesson_unitId_title_key" ON "CurriculumLesson"("unitId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumUnit_ragSourceId_title_key" ON "CurriculumUnit"("ragSourceId", "title");
