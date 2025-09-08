-- AlterTable
ALTER TABLE "public"."VocabularyItem" ADD COLUMN     "source" TEXT,
ADD COLUMN     "traditional" TEXT;

-- CreateIndex
CREATE INDEX "VocabularyItem_source_idx" ON "public"."VocabularyItem"("source");
