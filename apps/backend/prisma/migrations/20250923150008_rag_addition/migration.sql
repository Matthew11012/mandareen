-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "notes" JSONB;

-- CreateTable
CREATE TABLE "public"."RagSource" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "language" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RagSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RagSection" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "heading" TEXT,
    "slug" TEXT,
    "tags" TEXT[],
    "hskMin" INTEGER,
    "hskMax" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RagSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RagChunk" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "hanzi" TEXT,
    "english" TEXT,
    "tokens" INTEGER,
    "tags" TEXT[],
    "hskMin" INTEGER,
    "hskMax" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embeddingZh" JSONB,
    "embeddingEn" JSONB,

    CONSTRAINT "RagChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RagChunk_sourceId_idx" ON "public"."RagChunk"("sourceId");

-- CreateIndex
CREATE INDEX "RagChunk_sectionId_idx" ON "public"."RagChunk"("sectionId");

-- CreateIndex
CREATE INDEX "RagChunk_hskMin_hskMax_idx" ON "public"."RagChunk"("hskMin", "hskMax");

-- AddForeignKey
ALTER TABLE "public"."RagSection" ADD CONSTRAINT "RagSection_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "public"."RagSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RagChunk" ADD CONSTRAINT "RagChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "public"."RagSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RagChunk" ADD CONSTRAINT "RagChunk_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "public"."RagSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
