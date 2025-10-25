-- Add indexes for weekly goal performance optimization
-- This migration adds indexes to optimize weekly progress queries

-- Index for LessonProgress queries by userId and finishedAt (for weekly progress counting)
CREATE INDEX IF NOT EXISTS "LessonProgress_userId_finishedAt_idx" ON "LessonProgress"("userId", "finishedAt");

-- Index for CurriculumProgress queries by userId, status, and updatedAt (for weekly progress counting)
CREATE INDEX IF NOT EXISTS "CurriculumProgress_userId_status_updatedAt_idx" ON "CurriculumProgress"("userId", "status", "updatedAt");
