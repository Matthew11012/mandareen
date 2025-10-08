-- CreateEnum
CREATE TYPE "public"."CurriculumActivityType" AS ENUM ('READ', 'VOCAB', 'GRAMMAR', 'QUIZ', 'LISTEN', 'SPEAK');

-- CreateEnum
CREATE TYPE "public"."CurriculumProgressStatus" AS ENUM ('in_progress', 'completed');

-- DropForeignKey
ALTER TABLE "public"."LessonProgress" DROP CONSTRAINT "LessonProgress_lessonId_fkey";

-- DropForeignKey
ALTER TABLE "public"."LessonProgress" DROP CONSTRAINT "LessonProgress_userId_fkey";

-- AlterTable
ALTER TABLE "public"."LessonProgress" ALTER COLUMN "finishedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."CurriculumUnit" (
    "id" SERIAL NOT NULL,
    "ragSourceId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "targetLevelMin" INTEGER DEFAULT 0,
    "targetLevelMax" INTEGER DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurriculumUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CurriculumLesson" (
    "id" SERIAL NOT NULL,
    "unitId" INTEGER NOT NULL,
    "ragSectionId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "objectives" JSONB,
    "grammarKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurriculumLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CurriculumActivity" (
    "id" SERIAL NOT NULL,
    "lessonId" INTEGER NOT NULL,
    "type" "public"."CurriculumActivityType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "levelBand" INTEGER NOT NULL DEFAULT 0,
    "content" JSONB NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurriculumActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CurriculumProgress" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "unitId" INTEGER,
    "lessonId" INTEGER,
    "activityId" INTEGER,
    "status" "public"."CurriculumProgressStatus" NOT NULL,
    "score" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurriculumProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActivityAttempt" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "activityId" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserCurriculumBookmark" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "unitId" INTEGER,
    "lessonId" INTEGER,
    "activityId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCurriculumBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumUnit_ragSourceId_key" ON "public"."CurriculumUnit"("ragSourceId");

-- CreateIndex
CREATE INDEX "CurriculumLesson_unitId_idx" ON "public"."CurriculumLesson"("unitId");

-- CreateIndex
CREATE INDEX "CurriculumLesson_ragSectionId_idx" ON "public"."CurriculumLesson"("ragSectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumLesson_unitId_ragSectionId_key" ON "public"."CurriculumLesson"("unitId", "ragSectionId");

-- CreateIndex
CREATE INDEX "CurriculumActivity_lessonId_type_idx" ON "public"."CurriculumActivity"("lessonId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumActivity_lessonId_type_version_levelBand_key" ON "public"."CurriculumActivity"("lessonId", "type", "version", "levelBand");

-- CreateIndex
CREATE INDEX "CurriculumProgress_userId_unitId_idx" ON "public"."CurriculumProgress"("userId", "unitId");

-- CreateIndex
CREATE INDEX "CurriculumProgress_userId_lessonId_idx" ON "public"."CurriculumProgress"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "CurriculumProgress_userId_activityId_idx" ON "public"."CurriculumProgress"("userId", "activityId");

-- CreateIndex
CREATE INDEX "ActivityAttempt_userId_activityId_idx" ON "public"."ActivityAttempt"("userId", "activityId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCurriculumBookmark_userId_key" ON "public"."UserCurriculumBookmark"("userId");

-- AddForeignKey
ALTER TABLE "public"."LessonProgress" ADD CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "public"."Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CurriculumUnit" ADD CONSTRAINT "CurriculumUnit_ragSourceId_fkey" FOREIGN KEY ("ragSourceId") REFERENCES "public"."RagSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CurriculumLesson" ADD CONSTRAINT "CurriculumLesson_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."CurriculumUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CurriculumLesson" ADD CONSTRAINT "CurriculumLesson_ragSectionId_fkey" FOREIGN KEY ("ragSectionId") REFERENCES "public"."RagSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CurriculumActivity" ADD CONSTRAINT "CurriculumActivity_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "public"."CurriculumLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CurriculumProgress" ADD CONSTRAINT "CurriculumProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CurriculumProgress" ADD CONSTRAINT "CurriculumProgress_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."CurriculumUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CurriculumProgress" ADD CONSTRAINT "CurriculumProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "public"."CurriculumLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CurriculumProgress" ADD CONSTRAINT "CurriculumProgress_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "public"."CurriculumActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivityAttempt" ADD CONSTRAINT "ActivityAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivityAttempt" ADD CONSTRAINT "ActivityAttempt_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "public"."CurriculumActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserCurriculumBookmark" ADD CONSTRAINT "UserCurriculumBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserCurriculumBookmark" ADD CONSTRAINT "UserCurriculumBookmark_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."CurriculumUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserCurriculumBookmark" ADD CONSTRAINT "UserCurriculumBookmark_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "public"."CurriculumLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserCurriculumBookmark" ADD CONSTRAINT "UserCurriculumBookmark_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "public"."CurriculumActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
