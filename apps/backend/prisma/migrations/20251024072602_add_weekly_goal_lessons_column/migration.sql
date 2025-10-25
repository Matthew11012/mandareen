/*
  Warnings:

  - You are about to alter the column `vector` on the `RagEmbedding` table. The data in that column could be lost. The data in that column will be cast from `vector` to `Unsupported("vector")`.

*/
-- DropIndex
DROP INDEX "public"."idx_lp_user_finished";

-- AlterTable
ALTER TABLE "RagEmbedding" ALTER COLUMN "vector" SET DATA TYPE vector;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "weeklyGoalLessons" INTEGER;
