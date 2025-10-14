import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../openai/openai.service';
import { RagService } from '../rag/rag.service';
import { SegmentationService } from '../vocabulary/segmentation.service';
import { toToneMarks } from '../utils/pinyin';

@Injectable()
export class CurriculumService {
  private readonly logger = new Logger(CurriculumService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAIService,
    private readonly rag: RagService,
    private readonly segmentationService: SegmentationService,
  ) {}

  async listSources() {
    const sources = await this.prisma.ragSource.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        title: true,
        sourceType: true,
        language: true,
        metadata: true,
      },
    });
    return sources.map((s) => ({
      id: s.id,
      key: (s as any)?.metadata?.slug || String(s.id),
      title: s.title,
      type: s.sourceType,
      language: s.language || 'zh',
    }));
  }

  async listUnitsWithProgress(
    userId: number,
    opts?: { sourceId?: number; sourceSlug?: string },
  ) {
    const where: any = {};
    if (opts?.sourceId) where.ragSourceId = opts.sourceId;
    // Only resolve slug when id is not provided
    if (!opts?.sourceId && opts?.sourceSlug) {
      const source = await this.prisma.ragSource.findFirst({
        where: { metadata: { path: ['slug'], equals: opts.sourceSlug } as any },
        select: { id: true },
      });
      where.ragSourceId = source ? source.id : -1; // no results when slug unknown
    }
    const units = await this.prisma.curriculumUnit.findMany({
      where,
      orderBy: { order: 'asc' },
      include: {
        lessons: { select: { id: true } },
        _count: {
          select: {
            lessons: {
              where: {
                progresses: {
                  some: { userId, status: 'completed' as any },
                },
              },
            },
          },
        },
      },
    });
    return (units as any[]).map((u: any) => ({
      id: u.id,
      title: u.title,
      description: u.description,
      totalLessons: u.lessons.length,
      completedLessons: u._count?.lessons ?? 0,
    }));
  }

  async getUnitDetail(userId: number, unitId: number) {
    if (!Number.isFinite(unitId)) {
      throw new Error('Invalid unitId');
    }
    const debugStart = process.env.CURRICULUM_DEBUG ? Date.now() : 0;
    const unit = await this.prisma.curriculumUnit.findUnique({
      where: { id: unitId },
      include: {
        lessons: {
          orderBy: { order: 'asc' },
          include: {
            progresses: {
              where: { userId, status: 'completed' as any },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!unit) return null;
    const uUnit: any = unit as any;
    const result = {
      id: unit.id,
      title: unit.title,
      description: unit.description,
      lessons: uUnit.lessons.map((l: any) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        order: l.order,
        completed: Array.isArray(l.progresses) && l.progresses.length > 0,
      })),
    };
    if (process.env.CURRICULUM_DEBUG && debugStart) {
      this.logger.log(
        `getUnitDetail computed in ${Date.now() - debugStart}ms for unit ${unitId}`,
      );
    }
    return result;
  }

  async getUnitNavigation(
    userId: number,
    currentUnitId: number,
    opts?: { sourceId?: number; sourceSlug?: string },
  ) {
    const where: any = {};
    if (opts?.sourceId) where.ragSourceId = opts.sourceId;
    if (!opts?.sourceId && opts?.sourceSlug) {
      const source = await this.prisma.ragSource.findFirst({
        where: { metadata: { path: ['slug'], equals: opts.sourceSlug } as any },
        select: { id: true },
      });
      where.ragSourceId = source ? source.id : -1;
    }

    // Get all units in order
    const units = await this.prisma.curriculumUnit.findMany({
      where,
      orderBy: { order: 'asc' },
      select: { id: true, title: true, order: true },
    });

    // Find current unit index
    const currentIndex = units.findIndex((u) => u.id === currentUnitId);

    if (currentIndex === -1) {
      return { previous: null, next: null };
    }

    const previous = currentIndex > 0 ? units[currentIndex - 1] : null;
    const next =
      currentIndex < units.length - 1 ? units[currentIndex + 1] : null;

    return { previous, next };
  }

  async getLessonNavigation(
    userId: number,
    currentUnitId: number,
    currentLessonId: number,
    opts?: { sourceId?: number; sourceSlug?: string },
  ) {
    const debugStart = process.env.CURRICULUM_DEBUG ? Date.now() : 0;
    const where: any = {};
    if (opts?.sourceId) where.ragSourceId = opts.sourceId;
    if (!opts?.sourceId && opts?.sourceSlug) {
      const source = await this.prisma.ragSource.findFirst({
        where: { metadata: { path: ['slug'], equals: opts.sourceSlug } as any },
        select: { id: true },
      });
      where.ragSourceId = source ? source.id : -1;
    }

    // Load current lesson and its unit info
    const currentLesson = await this.prisma.curriculumLesson.findUnique({
      where: { id: currentLessonId },
      select: {
        id: true,
        title: true,
        order: true,
        unitId: true,
        unit: {
          select: { id: true, title: true, order: true, ragSourceId: true },
        },
      },
    });
    if (!currentLesson || currentLesson.unitId !== currentUnitId) {
      return { previous: null, next: null };
    }

    const unitFilter: any = {};
    if (typeof where.ragSourceId === 'number')
      unitFilter.ragSourceId = where.ragSourceId;

    // Previous in same unit
    const prevInUnit = await this.prisma.curriculumLesson.findFirst({
      where: {
        unitId: currentLesson.unitId,
        order: { lt: currentLesson.order },
      },
      orderBy: { order: 'desc' },
      select: {
        id: true,
        title: true,
        order: true,
        unitId: true,
        unit: { select: { id: true, title: true } },
      },
    });

    // Next in same unit
    const nextInUnit = await this.prisma.curriculumLesson.findFirst({
      where: {
        unitId: currentLesson.unitId,
        order: { gt: currentLesson.order },
      },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        title: true,
        order: true,
        unitId: true,
        unit: { select: { id: true, title: true } },
      },
    });

    let previous: any = null;
    let next: any = null;

    if (prevInUnit) {
      previous = {
        unitId: prevInUnit.unitId,
        unitTitle: prevInUnit.unit?.title || '',
        lessonId: prevInUnit.id,
        lessonTitle: prevInUnit.title,
        lessonOrder: prevInUnit.order,
      };
    } else {
      // Find previous unit by order within same source filter
      const prevUnit = await this.prisma.curriculumUnit.findFirst({
        where: { ...unitFilter, order: { lt: currentLesson.unit.order } },
        orderBy: { order: 'desc' },
        select: { id: true, title: true },
      });
      if (prevUnit) {
        const lastLessonPrevUnit = await this.prisma.curriculumLesson.findFirst(
          {
            where: { unitId: prevUnit.id },
            orderBy: { order: 'desc' },
            select: { id: true, title: true, order: true, unitId: true },
          },
        );
        if (lastLessonPrevUnit) {
          previous = {
            unitId: prevUnit.id,
            unitTitle: prevUnit.title,
            lessonId: lastLessonPrevUnit.id,
            lessonTitle: lastLessonPrevUnit.title,
            lessonOrder: lastLessonPrevUnit.order,
          };
        }
      }
    }

    if (nextInUnit) {
      next = {
        unitId: nextInUnit.unitId,
        unitTitle: nextInUnit.unit?.title || '',
        lessonId: nextInUnit.id,
        lessonTitle: nextInUnit.title,
        lessonOrder: nextInUnit.order,
      };
    } else {
      // Find next unit by order within same source filter
      const nextUnit = await this.prisma.curriculumUnit.findFirst({
        where: { ...unitFilter, order: { gt: currentLesson.unit.order } },
        orderBy: { order: 'asc' },
        select: { id: true, title: true },
      });
      if (nextUnit) {
        const firstLessonNextUnit =
          await this.prisma.curriculumLesson.findFirst({
            where: { unitId: nextUnit.id },
            orderBy: { order: 'asc' },
            select: { id: true, title: true, order: true, unitId: true },
          });
        if (firstLessonNextUnit) {
          next = {
            unitId: nextUnit.id,
            unitTitle: nextUnit.title,
            lessonId: firstLessonNextUnit.id,
            lessonTitle: firstLessonNextUnit.title,
            lessonOrder: firstLessonNextUnit.order,
          };
        }
      }
    }

    if (process.env.CURRICULUM_DEBUG && debugStart) {
      this.logger.log(
        `getLessonNavigation computed in ${Date.now() - debugStart}ms for lesson ${currentLessonId}`,
      );
    }

    return { previous, next };
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

    // Preload descendant context for RAG (### + all ####/##### under it)
    const lessonContext = await this.buildLessonRagContext(lesson.id);

    // Determine which activities missing
    const existing = await this.prisma.curriculumActivity.findMany({
      where: { lessonId },
      select: { type: true, levelBand: true },
    });
    const has = (t: string) =>
      existing.some((e) => e.type === t && e.levelBand === levelBand);

    // Generate sequentially per lesson: READ -> GRAMMAR -> QUIZ
    if (force || !has('READ')) {
      await this.generateRead(lessonId, levelBand, lesson, lessonContext);
    }
    const readContent = await this.getActivityContent(
      lessonId,
      'READ',
      levelBand,
    );

    if (force || !has('GRAMMAR')) {
      await this.generateGrammar(lessonId, levelBand, lesson, lessonContext);
    }
    const grammarContent = await this.getActivityContent(
      lessonId,
      'GRAMMAR',
      levelBand,
    );

    if (force || !has('QUIZ')) {
      await this.generateQuiz(
        lessonId,
        levelBand,
        lessonContext,
        readContent,
        grammarContent,
      );
    }

    return this.getLessonWithActivities(args.userId, args.unitId, lessonId);
  }

  private async generateRead(
    lessonId: number,
    levelBand: number,
    lesson: any,
    ctx: { chunks: any[]; contextText: string },
  ) {
    const passageTitle =
      lesson.title || lesson.ragSection?.heading || 'Reading';
    const citations = (ctx?.chunks || [])
      .slice(0, 6)
      .map((c: any, i: number) => ({
        chunkId: c.id,
        key: `[S${i + 1}]`,
      }));
    const read = await (this.openai as any).generateReadPassage({
      title: passageTitle,
      level: Math.max(1, levelBand || 1),
      context: ctx?.contextText || '',
      maxChars: 800,
    });
    // Enrich micro-passage with segments/pinyin/translation
    let segments: any[] = [];
    try {
      const segs = await this.segmentationService.segmentText(
        read?.passage?.hanzi || '',
      );
      segments = segs.map((s) => ({
        text: s.word,
        startIndex: s.startIndex,
        endIndex: s.endIndex,
        isWord: s.isWord,
        hskLevel: s.hskLevel,
        pinyin: toToneMarks((s.pinyin || '').toLowerCase()),
        definition: s.definition,
        definitions: s.definitions,
      }));
    } catch {
      // leave segments empty on failure
    }
    // Process comprehension questions with segmentation
    let processedQuestions: any[] = [];
    if (Array.isArray(read?.questions)) {
      for (const question of read.questions) {
        let questionSegments: any[] = [];
        try {
          const segs = await this.segmentationService.segmentText(
            question.prompt || '',
          );
          questionSegments = segs.map((s) => ({
            text: s.word,
            startIndex: s.startIndex,
            endIndex: s.endIndex,
            isWord: s.isWord,
            hskLevel: s.hskLevel,
            pinyin: toToneMarks((s.pinyin || '').toLowerCase()),
            definition: s.definition,
            definitions: s.definitions,
          }));
        } catch {
          // leave segments empty on failure
        }

        processedQuestions.push({
          ...question,
          segments: questionSegments,
        });
      }
    }

    const content = {
      title: passageTitle,
      type: 'READ',
      levelBand,
      passage: {
        hanzi: read?.passage?.hanzi || '',
        pinyin: read?.passage?.pinyin || '',
        translation: read?.passage?.translation || '',
      },
      segments,
      questions: processedQuestions,
      citations,
    };
    await this.prisma.curriculumActivity.create({
      data: { lessonId, type: 'READ' as any, levelBand, content },
    });
  }

  private async generateGrammar(
    lessonId: number,
    levelBand: number,
    lesson: any,
    ctx: { chunks: any[]; contextText: string },
  ) {
    // Build outline from descendant sub-subchapters (if present in metadata of chunks' sections)
    const outline = await this.buildSubsubOutlineForLesson(lessonId);
    const sectionCount = Math.max(outline.length || 1, 1); // ensure at least 1
    const explain = await (this.openai as any).generateCurriculumExplainLesson({
      title: lesson.title || lesson.ragSection?.heading || 'Lesson',
      level: Math.max(1, levelBand || 1),
      outline: outline.map((t: string) => ({ title: t })),
      context: ctx?.contextText || '',
      maxSections: sectionCount,
      preferMicroPassageChars: (ctx?.chunks?.length || 0) > 12 ? 280 : 180,
    });
    const fallbackCitations = (ctx?.chunks || [])
      .slice(0, 6)
      .map((c: any, i: number) => ({
        chunkId: c.id,
        key: `[S${i + 1}]`,
      }));
    // Optionally enrich the microPassage with segments too
    const micro = explain?.microPassage || null;
    if (
      micro &&
      typeof micro?.hanzi === 'string' &&
      micro.hanzi.trim().length
    ) {
      try {
        const segs = await this.segmentationService.segmentText(micro.hanzi);
        (micro as any).segments = segs.map((s) => ({
          text: s.word,
          startIndex: s.startIndex,
          endIndex: s.endIndex,
          isWord: s.isWord,
          hskLevel: s.hskLevel,
          pinyin: toToneMarks((s.pinyin || '').toLowerCase()),
          definition: s.definition,
          definitions: s.definitions,
        }));
      } catch {
        // ignore segmentation errors for micro passage
      }
    }

    const content = {
      title: lesson.title || lesson.ragSection?.heading || 'Explain',
      type: 'GRAMMAR',
      overview: explain?.overview || '',
      sections: Array.isArray(explain?.sections) ? explain.sections : [],
      microPassage: micro,
      drills: [],
      citations:
        Array.isArray(explain?.citations) && explain.citations.length
          ? explain.citations
          : fallbackCitations,
    };
    await this.prisma.curriculumActivity.create({
      data: { lessonId, type: 'GRAMMAR' as any, levelBand, content },
    });
  }

  private async generateQuiz(
    lessonId: number,
    levelBand: number,
    ctx: { chunks: any[]; contextText: string },
    readContent: any,
    grammarContent: any,
  ) {
    const quiz = await (this.openai as any).generateQuizItems({
      level: Math.max(1, levelBand || 1),
      read: readContent || {},
      grammar: grammarContent || {},
      context: ctx?.contextText || '',
      numItems: 5,
    });
    const content = {
      title: 'Checkpoint Quiz',
      type: 'QUIZ',
      items: Array.isArray(quiz?.items) ? quiz.items : [],
      passingScore: 70,
      citations: (ctx?.chunks || []).slice(0, 6).map((c: any, i: number) => ({
        chunkId: c.id,
        key: `[S${i + 1}]`,
      })),
    };
    await this.prisma.curriculumActivity.create({
      data: { lessonId, type: 'QUIZ' as any, levelBand, content },
    });
  }

  private async buildSubsubOutlineForLesson(
    lessonId: number,
  ): Promise<string[]> {
    const lesson = await this.prisma.curriculumLesson.findUnique({
      where: { id: lessonId },
      include: { unit: true },
    });
    if (!lesson) return [];
    const subchapterNumber = (lesson as any).metadata?.subchapterNumber || '';
    const unit = await this.prisma.curriculumUnit.findUnique({
      where: { id: lesson.unitId },
      include: { ragSource: true },
    });
    const sourceId = unit?.ragSourceId || (unit as any)?.ragSource?.id || null;
    if (!sourceId || !subchapterNumber) return [];
    const sections = await this.prisma.ragSection.findMany({
      where: { sourceId },
      select: { heading: true, metadata: true },
    });
    const titles: string[] = [];
    for (const s of sections as any[]) {
      const md = s.metadata || {};
      const num = String(md.subsubchapterNumber || '');
      if (num && num.startsWith(subchapterNumber + '.')) {
        titles.push(s.heading || num);
      }
    }
    // Deduplicate preserving order
    const seen = new Set<string>();
    return titles.filter((t) => (seen.has(t) ? false : (seen.add(t), true)));
  }
  // Build RAG context for a lesson: include ### section (if present) and all ####/##### descendants
  private async buildLessonRagContext(
    lessonId: number,
  ): Promise<{ chunks: any[]; contextText: string }> {
    const lesson = await this.prisma.curriculumLesson.findUnique({
      where: { id: lessonId },
      include: { unit: true, ragSection: { include: { chunks: true } } },
    });
    if (!lesson) return { chunks: [], contextText: '' };

    // Collect candidate sections
    const subchapterNumber = (lesson as any).metadata?.subchapterNumber || '';
    const unit = await this.prisma.curriculumUnit.findUnique({
      where: { id: lesson.unitId },
      include: { ragSource: true },
    });
    const sourceId = unit?.ragSourceId || (unit as any)?.ragSource?.id || null;

    let sections: { id: number }[] = [];
    if (sourceId && subchapterNumber) {
      const all = await this.prisma.ragSection.findMany({
        where: { sourceId },
        select: { id: true, metadata: true },
      });
      sections = all.filter((s: any) => {
        const md = s.metadata || {};
        if (md.subchapterNumber === subchapterNumber) return true;
        const subsub = String(md.subsubchapterNumber || '');
        return subsub.startsWith(subchapterNumber + '.');
      });
    }

    const sectionIds = [
      ...(lesson.ragSectionId ? [lesson.ragSectionId] : []),
      ...sections.map((s) => s.id),
    ];
    const chunks = sectionIds.length
      ? await this.prisma.ragChunk.findMany({
          where: { sectionId: { in: sectionIds } },
          select: { id: true, hanzi: true, english: true, sectionId: true },
          orderBy: { id: 'asc' },
        })
      : [];
    const contextText = chunks
      .map(
        (c: any) =>
          `${c.hanzi || ''}`.trim() + (c.english ? `\n${c.english}` : ''),
      )
      .join('\n\n')
      .slice(0, 12000);
    return { chunks, contextText };
  }

  private async getActivityContent(
    lessonId: number,
    type: 'READ' | 'GRAMMAR' | 'QUIZ',
    levelBand: number,
  ): Promise<any | null> {
    const act = await this.prisma.curriculumActivity.findFirst({
      where: { lessonId, type: type as any, levelBand },
      select: { content: true },
    });
    return (act as any)?.content || null;
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
      const act = await this.prisma.curriculumActivity.findUnique({
        where: { id: activityId },
        select: {
          lessonId: true,
          lesson: { select: { unitId: true } },
        },
      });
      const lessonId = act?.lessonId || null;
      const unitId = act?.lesson?.unitId || null;

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
            // Backfill unit/lesson if missing
            unitId: existing.unitId ?? unitId,
            lessonId: existing.lessonId ?? lessonId,
          },
        });
      } else {
        await this.prisma.curriculumProgress.create({
          data: {
            userId,
            activityId,
            unitId,
            lessonId,
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
