-- CreateTable
CREATE TABLE "public"."VocabularySense" (
    "id" SERIAL NOT NULL,
    "vocabularyItemId" INTEGER NOT NULL,
    "pinyin" TEXT,
    "definition" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabularySense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VocabularySense_vocabularyItemId_idx" ON "public"."VocabularySense"("vocabularyItemId");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularySense_vocabularyItemId_pinyin_definition_key" ON "public"."VocabularySense"("vocabularyItemId", "pinyin", "definition");

-- AddForeignKey
ALTER TABLE "public"."VocabularySense" ADD CONSTRAINT "VocabularySense_vocabularyItemId_fkey" FOREIGN KEY ("vocabularyItemId") REFERENCES "public"."VocabularyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
