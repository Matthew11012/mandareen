-- CreateTable
CREATE TABLE "public"."FlashcardSentence" (
    "id" SERIAL NOT NULL,
    "flashcardId" INTEGER NOT NULL,
    "hanzi" TEXT NOT NULL,
    "pinyin" TEXT,
    "translation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlashcardSentence_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."FlashcardSentence" ADD CONSTRAINT "FlashcardSentence_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "public"."Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
