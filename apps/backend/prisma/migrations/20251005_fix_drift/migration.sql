-- Manual drift reconciliation migration
-- This migration updates history to match the current database and schema.prisma
-- Includes:
-- - pgvector extension (if missing)
-- - RagEmbedding table, unique and hnsw index, and FK to RagChunk
-- - LessonProgress table with FKs and indexes

-- Enable pgvector (safe if already present)
CREATE EXTENSION IF NOT EXISTS vector;

-- RagEmbedding: only create if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'RagEmbedding'
  ) THEN
    CREATE TABLE "RagEmbedding" (
      "id" SERIAL PRIMARY KEY,
      "chunkId" INTEGER NOT NULL,
      "kind" TEXT NOT NULL,
      "dimension" INTEGER NOT NULL,
      "vector" vector(1536) NULL,
      CONSTRAINT "RagEmbedding_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "RagChunk"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    );
  END IF;
END $$;

-- Unique index on (chunkId, kind)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'RagEmbedding_chunkId_kind_key'
  ) THEN
    CREATE UNIQUE INDEX "RagEmbedding_chunkId_kind_key" ON "RagEmbedding"("chunkId", "kind");
  END IF;
END $$;

-- If RagEmbedding.vector exists without dimensions, alter it to a fixed dimension
DO $$
DECLARE
  col_dims int;
BEGIN
  SELECT atttypmod INTO col_dims
  FROM pg_attribute a
  JOIN pg_class c ON a.attrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public' AND c.relname = 'RagEmbedding' AND a.attname = 'vector';

  -- For vector type, atttypmod encodes dimensions+VARHDRSZ; <= 0 suggests unspecified
  IF col_dims IS NOT NULL AND col_dims <= 0 THEN
    ALTER TABLE "RagEmbedding" ALTER COLUMN "vector" TYPE vector(1536);
  END IF;
END $$;

-- HNSW index on vector column (L2 distance) - create if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ragembedding_vector_hnsw'
  ) THEN
    CREATE INDEX "ragembedding_vector_hnsw" ON "RagEmbedding" USING hnsw ("vector" vector_l2_ops);
  END IF;
END $$;

-- LessonProgress: only create if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'LessonProgress'
  ) THEN
    CREATE TABLE "LessonProgress" (
      "id" SERIAL PRIMARY KEY,
      "userId" INTEGER NOT NULL,
      "lessonId" INTEGER NOT NULL,
      "finishedAt" TIMESTAMP NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
      CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    );
  END IF;
END $$;

-- Unique and regular indexes for LessonProgress
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'LessonProgress_userId_lessonId_key'
  ) THEN
    CREATE UNIQUE INDEX "LessonProgress_userId_lessonId_key" ON "LessonProgress"("userId", "lessonId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'LessonProgress_userId_idx'
  ) THEN
    CREATE INDEX "LessonProgress_userId_idx" ON "LessonProgress"("userId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'LessonProgress_lessonId_idx'
  ) THEN
    CREATE INDEX "LessonProgress_lessonId_idx" ON "LessonProgress"("lessonId");
  END IF;
END $$;


