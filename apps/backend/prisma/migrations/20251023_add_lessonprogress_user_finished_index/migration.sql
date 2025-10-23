-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_lp_user_finished" ON "LessonProgress"("userId", "finishedAt");
