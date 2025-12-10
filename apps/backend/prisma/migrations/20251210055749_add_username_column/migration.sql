/*
  Warnings:

  - You are about to alter the column `vector` on the `RagEmbedding` table. The data in that column could be lost. The data in that column will be cast from `vector` to `Unsupported("vector")`.
  - A unique constraint covering the columns `[username]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "RagEmbedding" ALTER COLUMN "vector" SET DATA TYPE vector;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
