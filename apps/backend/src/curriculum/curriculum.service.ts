import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../openai/openai.service';
import { RagService } from '../rag/rag.service';

@Injectable()
export class CurriculumService {
  private readonly logger = new Logger(CurriculumService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAIService,
    private readonly rag: RagService,
  ) {}

  async listUnitsWithProgress(userId: number) {
    const units = await this.prisma.curriculumUnit.findMany({
      orderBy: { order: 'asc' },
      include: { lessons: { select: { id: true } } },
    });
    // Compute simple % complete per unit
    const unitIds = units.map((u) => u.id);
    const progresses = await this.prisma.curriculumProgress.findMany({
      where: {
        userId,
        unitId: { in: unitIds },
        lessonId: { not: null },
        status: 'completed',
      },
      select: { unitId: true, lessonId: true },
      distinct: ['lessonId'],
    });
    const doneByUnit = new Map<number, number>();
    for (const p of progresses) {
      if (!p.unitId) continue;
      doneByUnit.set(p.unitId, (doneByUnit.get(p.unitId) || 0) + 1);
    }
    return units.map((u) => ({
      id: u.id,
      title: u.title,
      description: u.description,
      totalLessons: u.lessons.length,
      completedLessons: doneByUnit.get(u.id) || 0,
    }));
  }

  async getUnitDetail(userId: number, unitId: number) {
    const unit = await this.prisma.curriculumUnit.findUnique({
      where: { id: unitId },
      include: {
        lessons: {
          orderBy: { order: 'asc' },
          select: { id: true, title: true, description: true, order: true },
        },
      },
    });
    if (!unit) return null;
    const lessonIds = unit.lessons.map((l) => l.id);
    const completed = await this.prisma.curriculumProgress.findMany({
      where: { userId, lessonId: { in: lessonIds }, status: 'completed' },
      select: { lessonId: true },
      distinct: ['lessonId'],
    });
    const completedSet = new Set(completed.map((c) => c.lessonId));
    return {
      id: unit.id,
      title: unit.title,
      description: unit.description,
      lessons: unit.lessons.map((l) => ({
        ...l,
        completed: completedSet.has(l.id),
      })),
    };
  }

  async getLessonWithActivities(
    userId: number,
    unitId: number,
    lessonId: number,
  ) {
    const lesson = await this.prisma.curriculumLesson.findFirst({
      where: { id: lessonId, unitId },
      include: { activities: { orderBy: { order: 'asc' } } },
    });
    if (!lesson) return null;
    return lesson;
  }

  async generateMissingActivities(args: {
    userId: number;
    unitId: number;
    lessonId: number;
    levelBand: number;
    force: boolean;
  }) {
    const { lessonId, levelBand, force } = args;
    const lesson = await this.prisma.curriculumLesson.findUnique({
      where: { id: lessonId },
      include: {
        unit: { include: { ragSource: true } },
        ragSection: { include: { chunks: true } },
      },
    });
    if (!lesson) throw new Error('Lesson not found');

    // Determine which activities missing
    const existing = await this.prisma.curriculumActivity.findMany({
      where: { lessonId },
      select: { type: true, levelBand: true },
    });
    const has = (t: string) =>
      existing.some((e) => e.type === t && e.levelBand === levelBand);

    // Generate sequentially per lesson: READ -> GRAMMAR -> QUIZ
    if (force || !has('READ')) {
      await this.generateRead(lessonId, levelBand, lesson);
    }
    if (force || !has('GRAMMAR')) {
      await this.generateGrammar(lessonId, levelBand, lesson);
    }
    if (force || !has('QUIZ')) {
      await this.generateQuiz(lessonId, levelBand);
    }

    return this.getLessonWithActivities(args.userId, args.unitId, lessonId);
  }

  private async generateRead(lessonId: number, levelBand: number, lesson: any) {
    // Use RAG to get context from this section
    const ctx = await this.rag.retrieveForLesson(0, {
      topic: lesson.title || lesson.ragSection?.heading || undefined,
      level: Math.max(1, levelBand || 1),
    });
    const passageTitle =
      lesson.title || lesson.ragSection?.heading || 'Reading';
    // Reuse existing OpenAIService patterns to author a short passage; keep content schema stable
    const content = {
      title: passageTitle,
      type: 'READ',
      levelBand,
      passage: {
        hanzi: '',
        pinyin: '',
        translation: '',
      },
      segments: [],
      citations:
        (ctx as any)?.chunks?.slice(0, 3)?.map((c: any, i: number) => ({
          chunkId: c.id,
          key: `[S${i + 1}]`,
        })) || [],
    };
    await this.prisma.curriculumActivity.create({
      data: { lessonId, type: 'READ' as any, levelBand, content },
    });
  }

  private async generateGrammar(
    lessonId: number,
    levelBand: number,
    lesson: any,
  ) {
    // Ground to this section
    const ctx = await this.rag.retrieveForLesson(0, {
      topic: lesson.title || lesson.ragSection?.heading || undefined,
      level: Math.max(1, levelBand || 1),
    });
    const notes = await (this.openai as any).generateGrammarNotes(
      lesson.ragSection?.heading || lesson.title || '',
      {
        level: Math.max(1, levelBand || 1),
        contextText: (ctx as any)?.contextText,
      },
    );
    const content = {
      title: lesson.title || lesson.ragSection?.heading || 'Grammar',
      type: 'GRAMMAR',
      notes: notes?.grammarNotes || [],
      tips: notes?.tips || [],
      citations: notes?.citations || [],
    };
    await this.prisma.curriculumActivity.create({
      data: { lessonId, type: 'GRAMMAR' as any, levelBand, content },
    });
  }

  private async generateQuiz(lessonId: number, levelBand: number) {
    // Simple placeholder; real prompt would use READ + GRAMMAR content
    const content = {
      title: 'Checkpoint Quiz',
      type: 'QUIZ',
      items: [],
      passingScore: 70,
    };
    await this.prisma.curriculumActivity.create({
      data: { lessonId, type: 'QUIZ' as any, levelBand, content },
    });
  }

  async submitAttempt(args: {
    userId: number;
    activityId: number;
    payload: any;
    score?: number;
  }) {
    const { userId, activityId, payload, score } = args;
    await this.prisma.activityAttempt.create({
      data: { userId, activityId, payload, score: score ?? null },
    });
    // Update progress counters; mark completed if quiz passed
    if (typeof score === 'number') {
      const existing = await this.prisma.curriculumProgress.findFirst({
        where: { userId, activityId },
      });
      const newStatus =
        score >= 70 ? ('completed' as any) : ('in_progress' as any);
      if (existing) {
        await this.prisma.curriculumProgress.update({
          where: { id: existing.id },
          data: {
            status: newStatus,
            score,
            attempts: (existing.attempts || 0) + 1,
          },
        });
      } else {
        await this.prisma.curriculumProgress.create({
          data: {
            userId,
            activityId,
            status: newStatus,
            score,
            attempts: 1,
          },
        });
      }
    }
    return { ok: true };
  }
}
