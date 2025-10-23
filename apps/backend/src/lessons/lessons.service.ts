/* eslint-disable no-unused-vars */
import { Injectable, Logger } from '@nestjs/common';
import { toToneMarks } from '../utils/pinyin';
import { Observable } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../openai/openai.service';
import { SegmentationService } from '../vocabulary/segmentation.service';
import { RagService } from '../rag/rag.service';

interface GenerateOptions {
  level?: number;
  type?: 'story' | 'dialogue';
  readTimeMinutes?: number;
  topic?: string;
  requestId?: string;
  timeframe?: 'modern' | 'mythic' | 'imperial' | 'pre_modern' | 'futuristic';
}

@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly openAIService: OpenAIService,
    private readonly segmentationService: SegmentationService,
    private readonly ragService: RagService,
    private readonly jwt?: JwtService,
  ) {}

  private async batchUpsertVocabulary(
    items: Array<{
      hanzi: string;
      pinyin?: string;
      definition?: string;
      source?: string;
    }>,
  ): Promise<void> {
    if (!Array.isArray(items) || items.length === 0) return;
    const map = new Map<
      string,
      { hanzi: string; pinyin?: string; definition?: string; source?: string }
    >();
    for (const it of items) {
      const key = (it.hanzi || '').trim();
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          hanzi: key,
          pinyin: (it.pinyin || '').toLowerCase().trim() || undefined,
          definition: (it.definition || '').toString(),
          source: it.source || 'LLM-NE',
        });
      }
    }
    const dedup = Array.from(map.values());
    if (dedup.length === 0) return;

    const existing = await (this.prismaService as any).vocabularyItem.findMany({
      where: { hanzi: { in: dedup.map((d) => d.hanzi) } },
      select: { hanzi: true },
    });
    const existingSet = new Set<string>(existing.map((e: any) => e.hanzi));
    const toCreate = dedup.filter((d) => !existingSet.has(d.hanzi));

    if (toCreate.length > 0) {
      try {
        await (this.prismaService as any).vocabularyItem.createMany({
          data: toCreate.map((d) => ({
            hanzi: d.hanzi,
            pinyin: d.pinyin ? toToneMarks(d.pinyin) : '',
            definition: d.definition || '',
            isCustom: true,
            source: d.source || 'LLM-NE',
          })),
          skipDuplicates: true,
        });
      } catch (err) {
        this.logger.warn(
          'createMany(vocabularyItem) failed in batchUpsertVocabulary',
          err as any,
        );
      }
    }

    // No updates for existing rows as per policy; existing curated data remains unchanged.
  }

  private async populateWordInstancesForLesson(
    lessonId: number,
  ): Promise<void> {
    const lesson = await (this.prismaService as any).lesson.findUnique({
      where: { id: lessonId },
      select: {
        sections: {
          select: { id: true, sectionType: true, content: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!lesson?.sections || lesson.sections.length === 0) return;

    type Seg = {
      text: string;
      startIndex: number;
      endIndex: number;
      isWord: boolean;
    };
    const tokens = new Map<string, true>();
    const rows: Array<{
      sectionId: number;
      hanzi: string;
      startIndex: number;
      endIndex: number;
      context: string;
    }> = [];
    for (const s of lesson.sections as Array<{
      id: number;
      sectionType: string;
      content: any;
    }>) {
      const content: any = s.content || {};
      if ((s.sectionType || '').toLowerCase() === 'dialogue') {
        const turns: any[] = Array.isArray(content.turns) ? content.turns : [];
        for (const t of turns) {
          const segs: Seg[] = Array.isArray(t?.segments) ? t.segments : [];
          for (const seg of segs) {
            if (!seg?.isWord || !seg.text || !seg.text.trim()) continue;
            const hanzi = seg.text.trim();
            tokens.set(hanzi, true);
            rows.push({
              sectionId: s.id,
              hanzi,
              startIndex: Math.max(0, seg.startIndex || 0),
              endIndex: Math.max(0, seg.endIndex || 0),
              context: String(t?.hanzi || '').slice(0, 200),
            });
          }
        }
      } else {
        const segs: Seg[] = Array.isArray(content.segments)
          ? content.segments
          : [];
        for (const seg of segs) {
          if (!seg?.isWord || !seg.text || !seg.text.trim()) continue;
          const hanzi = seg.text.trim();
          tokens.set(hanzi, true);
          rows.push({
            sectionId: s.id,
            hanzi,
            startIndex: Math.max(0, seg.startIndex || 0),
            endIndex: Math.max(0, seg.endIndex || 0),
            context: String(content?.hanzi || '').slice(0, 200),
          });
        }
      }
    }
    if (rows.length === 0) return;

    const hanziList = Array.from(tokens.keys());
    const vocab = await (this.prismaService as any).vocabularyItem.findMany({
      where: { hanzi: { in: hanziList } },
      select: { id: true, hanzi: true },
    });
    const toId = new Map<string, number>();
    for (const v of vocab) toId.set(v.hanzi, v.id);

    const createRows = rows
      .map((r) => ({
        sectionId: r.sectionId,
        vocabId: toId.get(r.hanzi),
        startIndex: r.startIndex,
        endIndex: r.endIndex,
        context: r.context,
      }))
      .filter((r) => typeof r.vocabId === 'number') as Array<{
      sectionId: number;
      vocabId: number;
      startIndex: number;
      endIndex: number;
      context: string;
    }>;
    if (createRows.length === 0) return;

    const BATCH = 500;
    for (let i = 0; i < createRows.length; i += BATCH) {
      const slice = createRows.slice(i, i + BATCH);
      try {
        await (this.prismaService as any).wordInstance.createMany({
          data: slice,
        });
      } catch (err) {
        this.logger.warn('createMany(wordInstance) batch failed', err as any);
      }
    }
  }

  // Stream generation progress via SSE-compatible Observable
  streamGenerateWithToken(
    token: string,
    options: GenerateOptions,
  ): Observable<{ event: string; data: any } | { data: string }> {
    return new Observable((subscriber) => {
      // heartbeat handle must be visible to error/complete paths
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      (async () => {
        try {
          if (!this.jwt) throw new Error('JWT service not available');
          const payload = this.jwt.verify(token, {
            secret: process.env.JWT_SECRET as string,
          }) as any;
          const userId = Number(payload?.sub || payload?.id);
          const email = String(payload?.email || payload?.username || '');
          if (!userId) throw new Error('Unauthorized');

          const user = { id: userId, email } as { id: number; email: string };
          const emit = (event: string, data?: any) =>
            subscriber.next({ event, data });

          emit('queued');
          emit('started');

          // Heartbeat to keep SSE alive on proxies/browsers until completion
          heartbeat = setInterval(() => {
            try {
              subscriber.next({ event: 'heartbeat', data: { t: Date.now() } });
            } catch {
              void 0;
            }
          }, 15000);

          const level = options.level ?? (await this.resolveUserLevel(user.id));
          const type = options.type ?? 'dialogue';
          const readTimeMinutes =
            options.readTimeMinutes ?? (type === 'dialogue' ? 10 : 15);
          const topic = options.topic?.trim();
          const requestId = (options.requestId || '').trim();
          const timeframe = options.timeframe ?? 'modern';

          // Idempotency: if requestId provided, check if we already have a lesson persisted recently for this user+requestId
          if (requestId.length > 0) {
            try {
              const existing = await this.prismaService.lesson.findFirst({
                where: {
                  userId: user.id,
                  requestId,
                } as any,
                orderBy: { createdAt: 'desc' },
              } as any);
              if (existing) {
                // Immediately emit completion with existing id and end stream
                subscriber.next({
                  event: 'complete',
                  data: { id: existing.id },
                });
                subscriber.complete();
                return;
              }
            } catch (err) {
              this.logger.warn('Idempotency lookup failed', err as any);
            }
          }

          emit('step', { key: 'openai_generate_' + type });
          const generated =
            type === 'dialogue'
              ? await this.openaiGenerateDialogueLesson({
                  level,
                  readTimeMinutes,
                  topic,
                  timeframe,
                })
              : await this.openaiGenerateStoryLesson({
                  level,
                  readTimeMinutes,
                  topic,
                  timeframe,
                });

          if (type === 'dialogue') {
            emit('step', { key: 'segment_dialogue' });
            const turns = Array.isArray(generated.dialogue?.turns)
              ? generated.dialogue.turns
              : [];
            const namedEntitiesRaw = Array.isArray(
              (generated as any).namedEntities,
            )
              ? (generated as any).namedEntities
              : [];
            const namedEntities = namedEntitiesRaw
              .filter(
                (e: any) =>
                  typeof e?.hanzi === 'string' && e.hanzi.trim().length > 0,
              )
              .map((e: any) => ({
                text: (e.hanzi || '').trim(),
                pinyin: (e.pinyin || '').toLowerCase().trim(),
                definition: ((e.translation || e.definition || '') + '').trim(),
              }));
            const seenNe = new Set<string>();
            const dedupNamedEntities = namedEntities.filter((e: any) => {
              if (seenNe.has(e.text)) return false;
              seenNe.add(e.text);
              return true;
            });
            const turnsWithSegments = [] as any[];
            for (const t of turns) {
              let segs: any[] = [];
              try {
                segs = await this.segmentationService.segmentText(
                  t.hanzi || '',
                  dedupNamedEntities,
                );
              } catch (err) {
                this.logger.warn(
                  `Segmentation failed for a dialogue turn: ${String(err)}`,
                );
                segs = [];
              }
              const filledSegsRaw = this.fillSegmentPinyinFromLine(
                t.hanzi || '',
                '',
                segs.map((s) => ({
                  text: s.word,
                  startIndex: s.startIndex,
                  endIndex: s.endIndex,
                  isWord: s.isWord,
                  hskLevel: s.hskLevel,
                  pinyin: (s.pinyin || '')?.toLowerCase(),
                  definition: s.definition,
                  definitions: s.definitions,
                })),
              );
              const filledSegs = filledSegsRaw.map((s) => ({
                ...s,
                pinyin: toToneMarks(s.pinyin),
              }));
              turnsWithSegments.push({
                speaker: t.speaker,
                hanzi: t.hanzi || '',
                pinyin: toToneMarks(t.pinyin || ''),
                translation: t.translation || '',
                segments: filledSegs,
              });
            }

            // Start grammar/tips and quiz generation in parallel
            emit('step', { key: 'rag_retrieve_context' });
            const fullDialogue = turns.map((t: any) => t.hanzi).join('\n');
            const grammarPromise = (async () => {
              try {
                emit('step', { key: 'openai_generate_grammar_notes' });
                const ctx = await this.ragService.retrieveForLesson(user.id, {
                  topic: topic || generated.title || undefined,
                  level,
                });
                const profile = await this.ragService.getUserProfile(user.id);
                let notes = await (
                  this.openAIService as any
                ).generateGrammarNotes(fullDialogue, {
                  level: profile.level,
                  strugglingWords: profile.strugglingWords,
                  contextText: ctx?.contextText,
                });
                emit('step', { key: 'segment_grammar_notes_and_tips' });
                notes = await this.enrichNotesWithSegments(notes as any);
                if (Array.isArray((notes as any).tips)) {
                  const tipsRich = [] as Array<{
                    zh: string;
                    en?: string;
                    segments?: any[];
                  }>;
                  for (const t of (notes as any).tips) {
                    if (t && typeof t.zh === 'string') {
                      const segs = await this.enrichTextWithSegments(t.zh);
                      tipsRich.push({ zh: t.zh, en: t.en, segments: segs });
                    }
                  }
                  (notes as any).tipsRich = tipsRich;
                }
                const grammarNotes: any[] | undefined = Array.isArray(
                  (notes as any).grammarNotes,
                )
                  ? (notes as any).grammarNotes
                  : undefined;
                const tipsRichOut:
                  | Array<{ zh: string; en?: string; segments?: any[] }>
                  | undefined = Array.isArray((notes as any).tipsRich)
                  ? (notes as any).tipsRich
                  : undefined;
                return { grammarNotes, tipsRichOut };
              } catch {
                // advance anyway
                emit('step', { key: 'segment_grammar_notes_and_tips' });
                return { grammarNotes: undefined, tipsRichOut: undefined };
              }
            })();

            emit('step', { key: 'openai_generate_quiz' });
            const quizPromise = (async () => {
              try {
                const quiz = await (
                  this.openAIService as any
                ).generateQuizForDialogueLesson({
                  level,
                  title: generated.title || null,
                  dialogue: {
                    turns: turns.map((t: any) => ({
                      hanzi: t.hanzi,
                      translation: t.translation,
                    })),
                  },
                  numItems: 5,
                });
                return quiz;
              } catch (e) {
                this.logger.warn('Dialogue quiz generation failed', e as any);
                return {};
              }
            })();

            // Await parallel grammar and quiz
            const { grammarNotes, tipsRichOut } = await grammarPromise;
            const quizRaw = await quizPromise;

            // Segment quiz items
            let quizOut: any | undefined;
            try {
              if (
                Array.isArray((quizRaw as any)?.items) &&
                (quizRaw as any).items.length > 0
              ) {
                emit('step', { key: 'segment_quiz' });
                const itemsSeg = [] as any[];
                for (const it of (quizRaw as any).items) {
                  const qSeg = await this.enrichTextWithSegments(
                    it?.question?.zh,
                  );
                  const optSegs: any[] = [];
                  for (const opt of it?.options || []) {
                    const s = await this.enrichTextWithSegments(opt?.zh);
                    optSegs.push({ ...opt, segments: s });
                  }
                  itemsSeg.push({
                    question: {
                      zh: it?.question?.zh || '',
                      translation: it?.question?.translation || '',
                      segments: qSeg,
                    },
                    options: optSegs,
                    answerIndex:
                      typeof it?.answerIndex === 'number' ? it.answerIndex : 0,
                    rationale: it?.rationale,
                  });
                }
                quizOut = { items: itemsSeg, passingScore: 100 };
              }
            } catch (e) {
              this.logger.warn('Segment quiz failed', e as any);
            }

            // Upsert named entities into vocabulary (dialogue) - batched
            if (
              Array.isArray(dedupNamedEntities) &&
              dedupNamedEntities.length > 0
            ) {
              this.logger.debug?.(
                `Upserting ${dedupNamedEntities.length} named entities (dialogue)`,
              );
              await this.batchUpsertVocabulary(
                dedupNamedEntities.map((e: any) => ({
                  hanzi: e.text,
                  pinyin: e.pinyin,
                  definition: e.definition,
                  source: 'LLM-NE',
                })),
              );
            }

            emit('step', { key: 'persist_lesson' });

            // Normalize and process tags
            const rawTags = Array.isArray(generated.tags) ? generated.tags : [];
            const normalizedTags = this.normalizeTags(rawTags);
            const tagsWithSynonyms = this.applyTagSynonyms(normalizedTags);

            const created = await this.prismaService.lesson.create({
              data: {
                level,
                title: generated.title || null,
                createdBy: user.email,
                tags: tagsWithSynonyms,
                sections: {
                  create: [
                    {
                      sectionType: 'dialogue',
                      content: {
                        title: generated.title || null,
                        titlePinyin:
                          toToneMarks(generated.titlePinyin || '') || null,
                        titleTranslation: generated.titleTranslation || null,
                        turns: turnsWithSegments,
                        grammarNotes,
                        tipsRich: (typeof tipsRichOut !== 'undefined'
                          ? tipsRichOut
                          : undefined) as any,
                        quiz: quizOut,
                        timeframe,
                      },
                    },
                  ],
                },
              },
              select: { id: true },
            });
            try {
              await this.populateWordInstancesForLesson(created.id);
            } catch (e) {
              this.logger.warn(
                'populateWordInstancesForLesson failed (stream dialogue)',
                e as any,
              );
            }
            emit('complete', { id: created.id });
            if (heartbeat) clearInterval(heartbeat);
            subscriber.complete();
            return;
          }

          // story path (mirrors existing non-stream flow with emits)
          emit('step', { key: 'segment_story' });
          const mainText: string = (generated as any).story?.hanzi || '';
          const namedEntities = Array.isArray((generated as any).namedEntities)
            ? (generated as any).namedEntities
                .filter(
                  (e: any) =>
                    typeof e?.hanzi === 'string' && e.hanzi.trim().length > 0,
                )
                .map((e: any) => ({
                  text: e.hanzi,
                  pinyin: (e.pinyin || '').toLowerCase(),
                  definition: e.translation || e.definition || undefined,
                }))
            : [];
          const segs = await this.segmentationService.segmentText(
            mainText,
            namedEntities,
          );

          // Upsert named entities into vocabulary (story - streaming) - batched
          if (Array.isArray(namedEntities) && namedEntities.length > 0) {
            const seenNeStream = new Set<string>();
            const dedupNeStream = namedEntities.filter((e: any) => {
              if (seenNeStream.has(e.text)) return false;
              seenNeStream.add(e.text);
              return true;
            });
            this.logger.debug?.(
              `Upserting ${dedupNeStream.length} named entities (story-stream)`,
            );
            await this.batchUpsertVocabulary(
              dedupNeStream.map((e: any) => ({
                hanzi: e.text,
                pinyin: e.pinyin,
                definition: e.definition,
                source: 'LLM-NE',
              })),
            );
          }

          // Parallel grammar and quiz for story
          const storyHanzi = (generated as any).story?.hanzi || '';
          const storyTrans = (generated as any).story?.translation || '';
          emit('step', { key: 'openai_generate_grammar_notes' });
          const grammarPromise2 = (async () => {
            try {
              const ctx = await this.ragService.retrieveForLesson(user.id, {
                topic: topic || (generated as any).title || undefined,
                level,
              });
              const profile = await this.ragService.getUserProfile(user.id);
              let notes = await (
                this.openAIService as any
              ).generateGrammarNotes(storyHanzi, {
                level: profile.level,
                strugglingWords: profile.strugglingWords,
                contextText: ctx?.contextText,
              });
              emit('step', { key: 'segment_grammar_notes_and_tips' });
              notes = await this.enrichNotesWithSegments(notes as any);
              if (Array.isArray((notes as any).tips)) {
                const tipsRich = [] as Array<{
                  zh: string;
                  en?: string;
                  segments?: any[];
                }>;
                for (const t of (notes as any).tips) {
                  if (t && typeof t.zh === 'string') {
                    const seg = await this.enrichTextWithSegments(t.zh);
                    tipsRich.push({ zh: t.zh, en: t.en, segments: seg });
                  }
                }
                (notes as any).tipsRich = tipsRich;
              }
              const grammarNotes2: any[] | undefined = Array.isArray(
                (notes as any).grammarNotes,
              )
                ? (notes as any).grammarNotes
                : undefined;
              const tipsRichOut2:
                | Array<{ zh: string; en?: string; segments?: any[] }>
                | undefined = Array.isArray((notes as any).tipsRich)
                ? (notes as any).tipsRich
                : undefined;
              return { grammarNotes2, tipsRichOut2 };
            } catch (e) {
              this.logger.warn(
                'Error generating grammar notes for story',
                e as any,
              );
              emit('step', { key: 'segment_grammar_notes_and_tips' });
              return { grammarNotes2: undefined, tipsRichOut2: undefined };
            }
          })();

          emit('step', { key: 'openai_generate_quiz' });
          const quizPromise2 = (async () => {
            try {
              const quiz = await (
                this.openAIService as any
              ).generateQuizForStoryLesson({
                level,
                title: (generated as any).title || null,
                story: { hanzi: storyHanzi, translation: storyTrans },
                numItems: 5,
              });
              return quiz;
            } catch (e) {
              this.logger.warn('Story quiz generation failed', e as any);
              return {};
            }
          })();

          // Await parallel grammar/quiz
          const { grammarNotes2, tipsRichOut2 } = await grammarPromise2;
          const quizRaw2 = await quizPromise2;

          // Segment story quiz
          let quizOut2: any | undefined;
          try {
            if (
              Array.isArray((quizRaw2 as any)?.items) &&
              (quizRaw2 as any).items.length > 0
            ) {
              emit('step', { key: 'segment_quiz' });
              const itemsSeg = [] as any[];
              for (const it of (quizRaw2 as any).items) {
                const qSeg = await this.enrichTextWithSegments(
                  it?.question?.zh,
                );
                const optSegs: any[] = [];
                for (const opt of it?.options || []) {
                  const s = await this.enrichTextWithSegments(opt?.zh);
                  optSegs.push({ ...opt, segments: s });
                }
                itemsSeg.push({
                  question: {
                    zh: it?.question?.zh || '',
                    translation: it?.question?.translation || '',
                    segments: qSeg,
                  },
                  options: optSegs,
                  answerIndex:
                    typeof it?.answerIndex === 'number' ? it.answerIndex : 0,
                  rationale: it?.rationale,
                });
              }
              quizOut2 = { items: itemsSeg, passingScore: 100 };
            }
          } catch (e) {
            this.logger.warn('Segment story quiz failed', e as any);
          }

          emit('step', { key: 'persist_lesson' });
          const filledSegsRaw = this.fillSegmentPinyinFromLine(
            (generated as any).story?.hanzi || '',
            '',
            segs.map((s) => ({
              text: s.word,
              startIndex: s.startIndex,
              endIndex: s.endIndex,
              isWord: s.isWord,
              hskLevel: s.hskLevel,
              pinyin: (s.pinyin || '')?.toLowerCase(),
              definition: s.definition,
              definitions: s.definitions,
            })),
          );
          const filledSegs = filledSegsRaw.map((s) => ({
            ...s,
            pinyin: toToneMarks(s.pinyin),
          }));

          // Normalize and process tags
          const rawTags = Array.isArray((generated as any).tags)
            ? (generated as any).tags
            : [];
          const normalizedTags = this.normalizeTags(rawTags);
          const tagsWithSynonyms = this.applyTagSynonyms(normalizedTags);

          const created = await this.prismaService.lesson.create({
            data: {
              level,
              title: (generated as any).title || null,
              createdBy: user.email,
              tags: tagsWithSynonyms,
              sections: {
                create: [
                  {
                    sectionType: 'story',
                    content: {
                      title: (generated as any).title || null,
                      titlePinyin:
                        toToneMarks((generated as any).titlePinyin || '') ||
                        null,
                      titleTranslation:
                        (generated as any).titleTranslation || null,
                      hanzi: (generated as any).story?.hanzi || '',
                      pinyin: undefined,
                      translation: (generated as any).story?.translation || '',
                      segments: filledSegs,
                      grammarNotes: grammarNotes2,
                      tipsRich: (typeof tipsRichOut2 !== 'undefined'
                        ? tipsRichOut2
                        : undefined) as any,
                      quiz: quizOut2,
                      timeframe,
                    },
                  },
                ],
              },
            },
            select: { id: true },
          });
          try {
            await this.populateWordInstancesForLesson(created.id);
          } catch (e) {
            this.logger.warn(
              'populateWordInstancesForLesson failed (stream story)',
              e as any,
            );
          }
          emit('complete', { id: created.id });
          if (heartbeat) clearInterval(heartbeat);
          subscriber.complete();
        } catch (err) {
          this.logger.error('Stream generation failed', err as any);
          try {
            subscriber.next({
              event: 'error',
              data: { message: 'Generation failed' },
            });
          } finally {
            // ensure heartbeat is cleared on error
            try {
              if (heartbeat) clearInterval(heartbeat);
            } catch {
              void 0;
            }
            subscriber.complete();
          }
        }
      })();
    });
  }

  async generateAndStoreLesson(
    user: { id: number; email: string },
    options: GenerateOptions,
  ): Promise<{ id: number }> {
    const level = options.level ?? (await this.resolveUserLevel(user.id));
    const type = options.type ?? 'story';
    const readTimeMinutes = options.readTimeMinutes ?? 10;
    const topic = options.topic?.trim();
    const timeframe = options.timeframe ?? 'modern';

    const generated =
      type === 'dialogue'
        ? await this.openaiGenerateDialogueLesson({
            level,
            readTimeMinutes,
            topic,
            timeframe,
          })
        : await this.openaiGenerateStoryLesson({
            level,
            readTimeMinutes,
            topic,
            timeframe,
          });

    // Persist lesson
    let lesson;
    if (type === 'dialogue') {
      const turns = Array.isArray(generated.dialogue?.turns)
        ? generated.dialogue.turns
        : [];
      const namedEntities = Array.isArray((generated as any).namedEntities)
        ? (generated as any).namedEntities
            .filter(
              (e: any) =>
                typeof e?.hanzi === 'string' && e.hanzi.trim().length > 0,
            )
            .map((e: any) => ({
              text: (e.hanzi || '').trim(),
              pinyin: (e.pinyin || '').toLowerCase().trim(),
              definition: ((e.translation || e.definition || '') + '').trim(),
            }))
        : [];
      const seenGen = new Set<string>();
      const dedupNamedEntities = namedEntities.filter((e: any) => {
        if (seenGen.has(e.text)) return false;
        seenGen.add(e.text);
        return true;
      });

      const turnsWithSegments = [] as any[];
      for (const t of turns) {
        let segs: any[] = [];
        try {
          segs = await this.segmentationService.segmentText(
            t.hanzi || '',
            dedupNamedEntities,
          );
        } catch (err) {
          this.logger.warn(
            `Segmentation failed for a dialogue turn: ${String(err)}`,
          );
          segs = [];
        }

        // Fill missing pinyin from the dialogue turn pinyin line (fallback per character)
        const filledSegsRaw = this.fillSegmentPinyinFromLine(
          t.hanzi || '',
          t.pinyin || '',
          segs.map((s) => ({
            text: s.word,
            startIndex: s.startIndex,
            endIndex: s.endIndex,
            isWord: s.isWord,
            hskLevel: s.hskLevel,
            pinyin: (s.pinyin || '')?.toLowerCase(),
            definition: s.definition,
            definitions: s.definitions,
          })),
        );
        const filledSegs = filledSegsRaw.map((s) => ({
          ...s,
          pinyin: toToneMarks(s.pinyin),
        }));

        turnsWithSegments.push({
          speaker: t.speaker,
          hanzi: t.hanzi || '',
          pinyin: toToneMarks(t.pinyin || ''),
          translation: t.translation || '',
          segments: filledSegs,
        });
      }

      // Parallel grammar notes and quiz for dialogue
      const fullDialogue = turns.map((t: any) => t.hanzi).join('\n');
      const grammarPromise = (async () => {
        try {
          const ctx = await this.ragService.retrieveForLesson(user.id, {
            topic: topic || generated.title || undefined,
            level,
          });
          const profile = await this.ragService.getUserProfile(user.id);
          let notes = await (this.openAIService as any).generateGrammarNotes(
            fullDialogue,
            {
              level: profile.level,
              strugglingWords: profile.strugglingWords,
              contextText: ctx?.contextText,
            },
          );
          notes = await this.enrichNotesWithSegments(notes as any);
          if (Array.isArray((notes as any).tips)) {
            const tipsRich = [] as Array<{
              zh: string;
              en?: string;
              segments?: any[];
            }>;
            for (const t of (notes as any).tips) {
              if (t && typeof t.zh === 'string') {
                const segs = await this.enrichTextWithSegments(t.zh);
                tipsRich.push({ zh: t.zh, en: t.en, segments: segs });
              }
            }
            (notes as any).tipsRich = tipsRich;
          }
          const grammarNotes: any[] | undefined = Array.isArray(
            (notes as any).grammarNotes,
          )
            ? (notes as any).grammarNotes
            : undefined;
          const tipsRichOut:
            | Array<{ zh: string; en?: string; segments?: any[] }>
            | undefined = Array.isArray((notes as any).tipsRich)
            ? (notes as any).tipsRich
            : undefined;
          return { grammarNotes, tipsRichOut };
        } catch (err) {
          this.logger.warn('Grammar notes failed (dialogue)', err as any);
          return { grammarNotes: undefined, tipsRichOut: undefined };
        }
      })();
      const quizPromise = (async () => {
        try {
          const quiz = await (
            this.openAIService as any
          ).generateQuizForDialogueLesson({
            level,
            title: generated.title || null,
            dialogue: {
              turns: turns.map((t: any) => ({
                hanzi: t.hanzi,
                translation: t.translation,
              })),
            },
            numItems: 5,
          });
          return quiz;
        } catch (e) {
          this.logger.warn('Dialogue quiz generation failed', e as any);
          return {};
        }
      })();

      // Upsert named entities into vocabulary (dialogue) - batched
      if (Array.isArray(dedupNamedEntities) && dedupNamedEntities.length > 0) {
        this.logger.debug?.(
          `Upserting ${dedupNamedEntities.length} named entities (dialogue)`,
        );
        await this.batchUpsertVocabulary(
          dedupNamedEntities.map((e: any) => ({
            hanzi: e.text,
            pinyin: e.pinyin,
            definition: e.definition,
            source: 'LLM-NE',
          })),
        );
      }

      const { grammarNotes, tipsRichOut } = await grammarPromise;
      const quizRaw = await quizPromise;
      // Segment quiz
      let quizOut: any | undefined;
      try {
        if (
          Array.isArray((quizRaw as any)?.items) &&
          (quizRaw as any).items.length > 0
        ) {
          const itemsSeg = [] as any[];
          for (const it of (quizRaw as any).items) {
            const qSeg = await this.enrichTextWithSegments(it?.question?.zh);
            const optSegs: any[] = [];
            for (const opt of it?.options || []) {
              const s = await this.enrichTextWithSegments(opt?.zh);
              optSegs.push({ ...opt, segments: s });
            }
            itemsSeg.push({
              question: {
                zh: it?.question?.zh || '',
                translation: it?.question?.translation || '',
                segments: qSeg,
              },
              options: optSegs,
              answerIndex:
                typeof it?.answerIndex === 'number' ? it.answerIndex : 0,
              rationale: it?.rationale,
            });
          }
          quizOut = { items: itemsSeg, passingScore: 100 };
        }
      } catch (e) {
        this.logger.warn('Segment dialogue quiz failed', e as any);
      }

      // Normalize and process tags
      const rawTags = Array.isArray(generated.tags) ? generated.tags : [];
      const normalizedTags = this.normalizeTags(rawTags);
      const tagsWithSynonyms = this.applyTagSynonyms(normalizedTags);

      lesson = await this.prismaService.lesson.create({
        data: {
          level,
          title: generated.title || null,
          createdBy: user.email,
          tags: tagsWithSynonyms,
          sections: {
            create: [
              {
                sectionType: 'dialogue',
                content: {
                  title: generated.title || null,
                  titlePinyin: toToneMarks(generated.titlePinyin || '') || null,
                  titleTranslation: generated.titleTranslation || null,
                  turns: turnsWithSegments,
                  grammarNotes,
                  tipsRich: (typeof tipsRichOut !== 'undefined'
                    ? tipsRichOut
                    : undefined) as any,
                  quiz: quizOut,
                  timeframe,
                },
              },
            ],
          },
        },
        select: { id: true },
      });
      try {
        await this.populateWordInstancesForLesson(lesson.id);
      } catch (e) {
        this.logger.warn(
          'populateWordInstancesForLesson failed (dialogue)',
          e as any,
        );
      }
    } else {
      // story
      const mainText: string = generated.story?.hanzi || '';
      const namedEntitiesRaw2 = Array.isArray((generated as any).namedEntities)
        ? (generated as any).namedEntities
        : [];
      const namedEntities = namedEntitiesRaw2
        .filter(
          (e: any) => typeof e?.hanzi === 'string' && e.hanzi.trim().length > 0,
        )
        .map((e: any) => ({
          text: (e.hanzi || '').trim(),
          pinyin: (e.pinyin || '').toLowerCase().trim(),
          definition: ((e.translation || e.definition || '') + '').trim(),
        }));
      const seenNe2 = new Set<string>();
      const dedupNamedEntities2 = namedEntities.filter((e: any) => {
        if (seenNe2.has(e.text)) return false;
        seenNe2.add(e.text);
        return true;
      });
      const segs = await this.segmentationService.segmentText(
        mainText,
        dedupNamedEntities2,
      );

      // Fill missing pinyin from story.pinyin (fallback per character)
      const filledSegsRaw = this.fillSegmentPinyinFromLine(
        generated.story?.hanzi || '',
        '',
        segs.map((s) => ({
          text: s.word,
          startIndex: s.startIndex,
          endIndex: s.endIndex,
          isWord: s.isWord,
          hskLevel: s.hskLevel,
          pinyin: (s.pinyin || '')?.toLowerCase(),
          definition: s.definition,
          definitions: s.definitions,
        })),
      );
      const filledSegs = filledSegsRaw.map((s) => ({
        ...s,
        pinyin: toToneMarks(s.pinyin),
      }));

      // Parallel grammar and quiz for story
      const storyHanzi = generated.story?.hanzi || '';
      const storyTrans = generated.story?.translation || '';
      const grammarPromise2 = (async () => {
        try {
          const ctx = await this.ragService.retrieveForLesson(user.id, {
            topic: topic || generated.title || undefined,
            level,
          });
          const profile = await this.ragService.getUserProfile(user.id);
          let notes = await (this.openAIService as any).generateGrammarNotes(
            storyHanzi,
            {
              level: profile.level,
              strugglingWords: profile.strugglingWords,
              contextText: ctx?.contextText,
            },
          );
          notes = await this.enrichNotesWithSegments(notes as any);
          if (Array.isArray((notes as any).tips)) {
            const tipsRich = [] as Array<{
              zh: string;
              en?: string;
              segments?: any[];
            }>;
            for (const t of (notes as any).tips) {
              if (t && typeof t.zh === 'string') {
                const seg = await this.enrichTextWithSegments(t.zh);
                tipsRich.push({ zh: t.zh, en: t.en, segments: seg });
              }
            }
            (notes as any).tipsRich = tipsRich;
          }
          const grammarNotes: any[] | undefined = Array.isArray(
            (notes as any).grammarNotes,
          )
            ? (notes as any).grammarNotes
            : undefined;
          const tipsRichOut2:
            | Array<{ zh: string; en?: string; segments?: any[] }>
            | undefined = Array.isArray((notes as any).tipsRich)
            ? (notes as any).tipsRich
            : undefined;
          return { grammarNotes, tipsRichOut2 };
        } catch (err) {
          this.logger.warn('Error generating grammar notes', err as any);
          return { grammarNotes: undefined, tipsRichOut2: undefined };
        }
      })();
      const quizPromise2 = (async () => {
        try {
          const quiz = await (
            this.openAIService as any
          ).generateQuizForStoryLesson({
            level,
            title: generated.title || null,
            story: { hanzi: storyHanzi, translation: storyTrans },
            numItems: 5,
          });
          return quiz;
        } catch (e) {
          this.logger.warn('Story quiz generation failed', e as any);
          return {};
        }
      })();

      // Upsert named entities into vocabulary (story) - batched
      if (
        Array.isArray(dedupNamedEntities2) &&
        dedupNamedEntities2.length > 0
      ) {
        this.logger.debug?.(
          `Upserting ${dedupNamedEntities2.length} named entities (story)`,
        );
        await this.batchUpsertVocabulary(
          dedupNamedEntities2.map((e: any) => ({
            hanzi: e.text,
            pinyin: e.pinyin,
            definition: e.definition,
            source: 'LLM-NE',
          })),
        );
      }

      const { grammarNotes: grammarNotes2, tipsRichOut2 } =
        await grammarPromise2;
      const quizRaw2 = await quizPromise2;
      // Segment quiz
      let quizOut2: any | undefined;
      try {
        if (
          Array.isArray((quizRaw2 as any)?.items) &&
          (quizRaw2 as any).items.length > 0
        ) {
          const itemsSeg = [] as any[];
          for (const it of (quizRaw2 as any).items) {
            const qSeg = await this.enrichTextWithSegments(it?.question?.zh);
            const optSegs: any[] = [];
            for (const opt of it?.options || []) {
              const s = await this.enrichTextWithSegments(opt?.zh);
              optSegs.push({ ...opt, segments: s });
            }
            itemsSeg.push({
              question: {
                zh: it?.question?.zh || '',
                translation: it?.question?.translation || '',
                segments: qSeg,
              },
              options: optSegs,
              answerIndex:
                typeof it?.answerIndex === 'number' ? it.answerIndex : 0,
              rationale: it?.rationale,
            });
          }
          quizOut2 = { items: itemsSeg, passingScore: 100 };
        }
      } catch (e) {
        this.logger.warn('Segment story quiz failed', e as any);
      }

      // Normalize and process tags
      const rawTags = Array.isArray(generated.tags) ? generated.tags : [];
      const normalizedTags = this.normalizeTags(rawTags);
      const tagsWithSynonyms = this.applyTagSynonyms(normalizedTags);

      lesson = await this.prismaService.lesson.create({
        data: {
          level,
          title: generated.title || null,
          createdBy: user.email,
          tags: tagsWithSynonyms,
          sections: {
            create: [
              {
                sectionType: 'story',
                content: {
                  title: generated.title || null,
                  titlePinyin: toToneMarks(generated.titlePinyin || '') || null,
                  titleTranslation: generated.titleTranslation || null,
                  hanzi: generated.story?.hanzi || '',
                  pinyin: toToneMarks(generated.story?.pinyin || ''),
                  translation: generated.story?.translation || '',
                  segments: filledSegs,
                  grammarNotes: grammarNotes2,
                  tipsRich: (typeof tipsRichOut2 !== 'undefined'
                    ? tipsRichOut2
                    : undefined) as any,
                  quiz: quizOut2,
                  timeframe,
                },
              },
            ],
          },
        },
        select: { id: true },
      });
      try {
        await this.populateWordInstancesForLesson(lesson.id);
      } catch (e) {
        this.logger.warn(
          'populateWordInstancesForLesson failed (story)',
          e as any,
        );
      }
    }

    return { id: lesson.id };
  }

  async listLessons(
    level?: number,
    levels?: number[],
    timeframeTags?: string[],
    contentTags?: string[],
    includeUntagged?: boolean,
  ) {
    const whereConditions: any[] = [];

    // Level filtering
    if (levels && levels.length > 0) {
      whereConditions.push({ level: { in: levels } });
    } else if (level) {
      whereConditions.push({ level });
    }

    // Tag filtering
    if (includeUntagged) {
      // If includeUntagged is true, only return lessons with empty tags
      whereConditions.push({ tags: { equals: [] } });
    } else {
      // Regular tag filtering
      const tagConditions: any[] = [];

      if (timeframeTags && timeframeTags.length > 0) {
        tagConditions.push({ tags: { hasSome: timeframeTags } });
      }

      if (contentTags && contentTags.length > 0) {
        tagConditions.push({ tags: { hasSome: contentTags } });
      }

      if (tagConditions.length > 0) {
        whereConditions.push({ AND: tagConditions });
      }
    }

    const where =
      whereConditions.length > 0 ? { AND: whereConditions } : undefined;

    const lessons = await this.prismaService.lesson.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        sections: {
          select: { sectionType: true, content: true },
          take: 1,
          orderBy: { id: 'asc' },
        },
      },
    });
    return lessons.map((l) => {
      const first = l.sections[0];
      const content: any = first?.content || {};
      const lessonType = first?.sectionType || 'story';
      return {
        id: l.id,
        title: l.title,
        level: l.level,
        createdAt: l.createdAt,
        lessonType,
        titlePinyin: content.titlePinyin || null,
        titleTranslation: content.titleTranslation || null,
        tags: l.tags || [],
      } as any;
    });
  }

  async listLessonsByCreator(
    createdBy: string,
    level?: number,
    levels?: number[],
    timeframeTags?: string[],
    contentTags?: string[],
    includeUntagged?: boolean,
  ) {
    const whereConditions: any[] = [{ createdBy }];

    // Level filtering
    if (levels && levels.length > 0) {
      whereConditions.push({ level: { in: levels } });
    } else if (level) {
      whereConditions.push({ level });
    }

    // Tag filtering
    if (includeUntagged) {
      // If includeUntagged is true, only return lessons with empty tags
      whereConditions.push({ tags: { equals: [] } });
    } else {
      // Regular tag filtering
      const tagConditions: any[] = [];

      if (timeframeTags && timeframeTags.length > 0) {
        tagConditions.push({ tags: { hasSome: timeframeTags } });
      }

      if (contentTags && contentTags.length > 0) {
        tagConditions.push({ tags: { hasSome: contentTags } });
      }

      if (tagConditions.length > 0) {
        whereConditions.push({ AND: tagConditions });
      }
    }

    const where = { AND: whereConditions };

    const lessons = await this.prismaService.lesson.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        sections: {
          select: { sectionType: true, content: true },
          take: 1,
          orderBy: { id: 'asc' },
        },
      },
    });
    return lessons.map((l) => {
      const first = l.sections[0];
      const content: any = first?.content || {};
      const lessonType = first?.sectionType || 'story';
      return {
        id: l.id,
        title: l.title,
        level: l.level,
        createdAt: l.createdAt,
        lessonType,
        titlePinyin: content.titlePinyin || null,
        titleTranslation: content.titleTranslation || null,
        tags: l.tags || [],
      } as any;
    });
  }

  async getLessonById(id: number, currentUserId?: number) {
    const lesson = await this.prismaService.lesson.findUniqueOrThrow({
      where: { id },
      include: { sections: { orderBy: { id: 'asc' } } },
    });
    if (!currentUserId) return lesson as any;
    const progress = await (
      this.prismaService as any
    ).lessonProgress.findUnique({
      where: { userId_lessonId: { userId: currentUserId, lessonId: id } },
      select: { finishedAt: true },
    });
    return { ...lesson, finished: Boolean(progress?.finishedAt) } as any;
  }

  async markLessonFinished(userId: number, lessonId: number) {
    // Idempotent: upsert by unique (userId, lessonId)
    await (this.prismaService as any).lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { finishedAt: new Date() },
      create: { userId, lessonId, finishedAt: new Date() },
    });
    return { ok: true } as const;
  }

  async countFinishedLessons(userId: number): Promise<number> {
    return (this.prismaService as any).lessonProgress.count({
      where: { userId, finishedAt: { not: null } },
    });
  }

  async getFinishedLessonIds(userId: number): Promise<number[]> {
    const rows = await (this.prismaService as any).lessonProgress.findMany({
      where: { userId, finishedAt: { not: null } },
      select: { lessonId: true },
    });
    return rows.map((r: { lessonId: number }) => r.lessonId);
  }

  async getFinishedCountsByLevel(
    userId: number,
  ): Promise<Record<number, number>> {
    try {
      const rows: Array<{ level: number; count: bigint }> = await (
        this.prismaService as any
      ).$queryRawUnsafe(
        'SELECT l.level AS level, COUNT(*)::bigint AS count FROM "LessonProgress" p JOIN "Lesson" l ON l.id = p."lessonId" WHERE p."userId" = $1 AND p."finishedAt" IS NOT NULL GROUP BY l.level',
        userId,
      );
      const out: Record<number, number> = {};
      for (const r of rows) out[r.level] = Number(r.count);
      return out;
    } catch (e) {
      this.logger.warn(
        'getFinishedCountsByLevel aggregation failed; falling back',
        e as any,
      );
      const ids = await this.getFinishedLessonIds(userId);
      if (ids.length === 0) return {};
      const grouped = await (this.prismaService as any).lesson.groupBy({
        by: ['level'],
        where: { id: { in: ids } },
        _count: { id: true },
      });
      const out: Record<number, number> = {};
      for (const g of grouped) out[g.level] = g._count.id as number;
      return out;
    }
  }

  async getWordsReadCount(userId: number): Promise<number> {
    const finishedLessonIds = await this.getFinishedLessonIds(userId);
    if (!finishedLessonIds || finishedLessonIds.length === 0) return 0;

    // Try fast path via WordInstance if present in DB
    try {
      const distinct = await (this.prismaService as any).wordInstance.findMany({
        where: { section: { lessonId: { in: finishedLessonIds } } },
        select: { vocabId: true },
        distinct: ['vocabId'],
      });
      if (Array.isArray(distinct) && distinct.length > 0)
        return distinct.length;
    } catch {
      this.logger.warn('Error getting words read count via WordInstance');
    }

    // Fallback: derive unique words from lesson section content (segments) for finished lessons
    const lessons = await (this.prismaService as any).lesson.findMany({
      where: { id: { in: finishedLessonIds } },
      select: { sections: { select: { sectionType: true, content: true } } },
    });

    const uniqueWords = new Set<string>();
    for (const lesson of lessons as Array<{
      sections: Array<{ sectionType: string; content: any }>;
    }>) {
      for (const section of lesson.sections) {
        const type = (section.sectionType || '').toLowerCase();
        const content: any = section.content || {};
        if (type === 'dialogue') {
          const turns: any[] = Array.isArray(content.turns)
            ? content.turns
            : [];
          for (const t of turns) {
            const segs: any[] = Array.isArray(t?.segments) ? t.segments : [];
            for (const s of segs) {
              if (
                s &&
                s.isWord &&
                typeof s.text === 'string' &&
                s.text.trim().length > 0
              ) {
                uniqueWords.add(s.text.trim());
              }
            }
          }
        } else {
          const segs: any[] = Array.isArray(content.segments)
            ? content.segments
            : [];
          for (const s of segs) {
            if (
              s &&
              s.isWord &&
              typeof s.text === 'string' &&
              s.text.trim().length > 0
            ) {
              uniqueWords.add(s.text.trim());
            }
          }
        }
      }
    }
    return uniqueWords.size;
  }

  async getWordsReadByHsk(userId: number): Promise<Record<string, number>> {
    const finishedLessonIds = await this.getFinishedLessonIds(userId);
    if (!finishedLessonIds || finishedLessonIds.length === 0) return {};

    // Prefer relational path via WordInstance -> VocabularyItem.hskLevel
    try {
      const viaInstances: Array<{ hskLevel: number | null }> = await (
        this.prismaService as any
      ).wordInstance.findMany({
        where: { section: { lessonId: { in: finishedLessonIds } } },
        select: { vocab: { select: { hskLevel: true } } },
        distinct: ['vocabId'],
      });
      if (Array.isArray(viaInstances) && viaInstances.length > 0) {
        const counts: Record<string, number> = {};
        for (const row of viaInstances as any[]) {
          const lvl = row?.vocab?.hskLevel ?? null;
          const key = lvl ? String(lvl) : 'unknown';
          counts[key] = (counts[key] || 0) + 1;
        }
        return counts;
      }
    } catch {
      this.logger.warn('Error getting words read by HSK via WordInstance');
    }

    // Fallback: from sections.segments text -> VocabularyItem by hanzi.hanzi
    const lessons = await (this.prismaService as any).lesson.findMany({
      where: { id: { in: finishedLessonIds } },
      select: { sections: { select: { sectionType: true, content: true } } },
    });
    const uniqueTokens = new Set<string>();
    for (const lesson of lessons as Array<{
      sections: Array<{ sectionType: string; content: any }>;
    }>) {
      for (const section of lesson.sections) {
        const type = (section.sectionType || '').toLowerCase();
        const content: any = section.content || {};
        if (type === 'dialogue') {
          const turns: any[] = Array.isArray(content.turns)
            ? content.turns
            : [];
          for (const t of turns) {
            const segs: any[] = Array.isArray(t?.segments) ? t.segments : [];
            for (const s of segs) {
              if (
                s &&
                s.isWord &&
                typeof s.text === 'string' &&
                s.text.trim().length > 0
              ) {
                uniqueTokens.add(s.text.trim());
              }
            }
          }
        } else {
          const segs: any[] = Array.isArray(content.segments)
            ? content.segments
            : [];
          for (const s of segs) {
            if (
              s &&
              s.isWord &&
              typeof s.text === 'string' &&
              s.text.trim().length > 0
            ) {
              uniqueTokens.add(s.text.trim());
            }
          }
        }
      }
    }
    if (uniqueTokens.size === 0) return {};

    // Fetch hskLevel for those tokens from VocabularyItem.hanzi
    const tokenArray = Array.from(uniqueTokens);
    const vocabRows: Array<{ hanzi: string; hskLevel: number | null }> = await (
      this.prismaService as any
    ).vocabularyItem.findMany({
      where: { hanzi: { in: tokenArray } },
      select: { hanzi: true, hskLevel: true },
    });
    const hanziToLevel = new Map<string, number | null>();
    for (const v of vocabRows) hanziToLevel.set(v.hanzi, v.hskLevel ?? null);

    const counts: Record<string, number> = {};
    for (const token of tokenArray) {
      const lvl = hanziToLevel.get(token) ?? null;
      const key = lvl ? String(lvl) : 'unknown';
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }

  async getStudyStreakDays(userId: number, offsetMinutes = 0): Promise<number> {
    // Fetch finished legacy AI lessons
    const progresses: Array<{ finishedAt: Date | null }> = await (
      this.prismaService as any
    ).lessonProgress.findMany({
      where: { userId, finishedAt: { not: null } },
      select: { finishedAt: true },
      orderBy: { finishedAt: 'desc' },
    });
    // Fetch completed curriculum progress (use updatedAt as completion time)
    const curriculum: Array<{ updatedAt: Date }> = await (
      this.prismaService as any
    ).curriculumProgress.findMany({
      where: { userId, status: 'completed' },
      select: { updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (
      (!progresses || progresses.length === 0) &&
      (!curriculum || curriculum.length === 0)
    )
      return 0;

    // Build a set of LOCAL date keys (YYYY-MM-DD); multiple finishes per day count once
    const finishedDays = new Set<string>();
    for (const p of progresses) {
      if (!p.finishedAt) continue;
      const shifted = new Date(p.finishedAt.getTime() + offsetMinutes * 60_000);
      const key = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
      finishedDays.add(key);
    }
    for (const cp of curriculum) {
      const shifted = new Date(cp.updatedAt.getTime() + offsetMinutes * 60_000);
      const key = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
      finishedDays.add(key);
    }

    // Helper to format a shifted date's LOCAL key
    const formatKey = (date: Date) =>
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

    // Compute "today" in LOCAL time using offsetMinutes
    const now = new Date();
    const nowShifted = new Date(now.getTime() + offsetMinutes * 60_000);
    const todayLocal = new Date(
      Date.UTC(
        nowShifted.getUTCFullYear(),
        nowShifted.getUTCMonth(),
        nowShifted.getUTCDate(),
      ),
    );
    // Streak only counts if there is at least one finished lesson today
    if (!finishedDays.has(formatKey(todayLocal))) return 0;

    let streak = 1; // today is counted
    for (let i = 1; i < 10000; i++) {
      const d = new Date(todayLocal);
      d.setUTCDate(d.getUTCDate() - i);
      if (finishedDays.has(formatKey(d))) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  async getStudyStreakStatus(
    userId: number,
    offsetMinutes = 0,
  ): Promise<{
    todayContinued: boolean;
    streakDays: number;
    carryOverDays: number;
    lastActivityLocalDate: string | null;
  }> {
    // Fetch finished legacy AI lessons
    const progresses: Array<{ finishedAt: Date | null }> = await (
      this.prismaService as any
    ).lessonProgress.findMany({
      where: { userId, finishedAt: { not: null } },
      select: { finishedAt: true },
      orderBy: { finishedAt: 'desc' },
    });
    // Fetch completed curriculum progress (use updatedAt as completion time)
    const curriculum: Array<{ updatedAt: Date }> = await (
      this.prismaService as any
    ).curriculumProgress.findMany({
      where: { userId, status: 'completed' },
      select: { updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    // Build a set of LOCAL date keys (YYYY-MM-DD); multiple finishes per day count once
    const finishedDays = new Set<string>();
    for (const p of progresses) {
      if (!p.finishedAt) continue;
      const shifted = new Date(p.finishedAt.getTime() + offsetMinutes * 60_000);
      const key = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
      finishedDays.add(key);
    }
    for (const cp of curriculum) {
      const shifted = new Date(cp.updatedAt.getTime() + offsetMinutes * 60_000);
      const key = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
      finishedDays.add(key);
    }

    const formatKey = (date: Date) =>
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

    // Compute today and yesterday in LOCAL time using offsetMinutes
    const now = new Date();
    const nowShifted = new Date(now.getTime() + offsetMinutes * 60_000);
    const todayLocal = new Date(
      Date.UTC(
        nowShifted.getUTCFullYear(),
        nowShifted.getUTCMonth(),
        nowShifted.getUTCDate(),
      ),
    );
    const yesterdayLocal = new Date(todayLocal);
    yesterdayLocal.setUTCDate(yesterdayLocal.getUTCDate() - 1);

    // last activity (max key)
    let lastActivityLocalDate: string | null = null;
    if (finishedDays.size > 0) {
      lastActivityLocalDate =
        Array.from(finishedDays).sort().slice(-1)[0] ?? null;
    }

    // today streak (only if today has a completion)
    let todayStreak = 0;
    if (finishedDays.has(formatKey(todayLocal))) {
      todayStreak = 1;
      for (let i = 1; i < 10000; i++) {
        const d = new Date(todayLocal);
        d.setUTCDate(d.getUTCDate() - i);
        if (finishedDays.has(formatKey(d))) todayStreak++;
        else break;
      }
    }

    // yesterday streak (carry-over)
    let yesterdayStreak = 0;
    if (finishedDays.has(formatKey(yesterdayLocal))) {
      yesterdayStreak = 1;
      for (let i = 1; i < 10000; i++) {
        const d = new Date(yesterdayLocal);
        d.setUTCDate(d.getUTCDate() - i);
        if (finishedDays.has(formatKey(d))) yesterdayStreak++;
        else break;
      }
    }

    const todayContinued = todayStreak > 0;
    const streakDays = todayStreak; // keep semantics: includes today only if continued
    const carryOverDays = yesterdayStreak;

    return { todayContinued, streakDays, carryOverDays, lastActivityLocalDate };
  }

  private getTimeframeConditioning(
    timeframe: 'modern' | 'mythic' | 'imperial' | 'pre_modern' | 'futuristic',
  ): string {
    switch (timeframe) {
      case 'mythic':
        return `- **Temporal Constraints:**
            - Set the story strictly in a mythic/legendary era. No anachronisms or modern references.
            - Avoid: internet/互联网, 网络, 手机/phone, 社交媒体, AI/人工智能, 机器人, Wi-Fi, 电脑, 视频平台, 抖音/TikTok, 微信/WeChat, 品牌/brand names, 电影/现代影视 when used as current phenomena, 新冠/COVID, NFT/加密货币, 网红/influencer, 直播/live stream, etc.
            - Restrict namedEntities.kind to: person|title|location|event|festival|phrase (no brand/org).`;
      case 'imperial':
      case 'pre_modern':
        return `- **Temporal Constraints:**
            - Set the story in pre-industrial historical setting (e.g., imperial bureaucracy, agrarian life).
            - No modern brands/tech/politics. Allow period-appropriate artifacts (科举, 官衔, 马车, 布匹, 城墙).
            - Restrict namedEntities.kind to: person|title|location|event|festival|phrase (no brand/org).`;
      case 'modern':
        return `- **Content Requirements:**
            - If possible, infuse the story with inspiration from current events, trends, or recent cultural happenings (news, pop culture, popular activities, contemporary issues) relevant to the topic and appropriate for the specified HSK level.`;
      case 'futuristic':
        return `- **Temporal Constraints:**
            - Set the story in a speculative future setting. Encourage futuristic tech/culture.
            - Avoid grounding in today's specific real events unless explicitly requested.
            - Restrict namedEntities.kind to: person|title|location|event|festival|phrase|brand|org (futuristic context).`;
      default:
        return `- **Content Requirements:**
            - If possible, infuse the story with inspiration from current events, trends, or recent cultural happenings (news, pop culture, popular activities, contemporary issues) relevant to the topic and appropriate for the specified HSK level.`;
    }
  }

  private async resolveUserLevel(userId: number): Promise<number> {
    const latest = await this.prismaService.assessment.findFirst({
      where: { userId },
      orderBy: { takenAt: 'desc' },
      select: { levelPlaced: true },
    });
    return latest?.levelPlaced ?? 1;
  }

  private async openaiGenerateStoryLesson({
    level,
    readTimeMinutes,
    topic,
    timeframe,
  }: {
    level: number;
    readTimeMinutes: number;
    topic?: string;
    timeframe: 'modern' | 'mythic' | 'imperial' | 'pre_modern' | 'futuristic';
  }) {
    const preferredModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const client = (this.openAIService as any)
      .openai as import('openai').default;
    const approxChars = Math.min(readTimeMinutes * 300, 6000);
    const topicLine = topic
      ? `\nTOPIC (mandatory): ${topic}\n.You MUST center the entire story on this TOPIC. The title MUST include at least one keyword from the topic. Use domain-specific vocabulary related to the topic and include those items in the vocabulary list.`
      : `\nNo topic provided: choose a fresh everyday-life theme distinct from generic themes. Avoid those unless explicitly requested.`;
    const timeframeConditioning = this.getTimeframeConditioning(timeframe);

    // Get existing content tags to prefer in generation
    const existingContentTags = await this.getExistingContentTags();
    const availableTagsText =
      existingContentTags.length > 0
        ? `\n\nAVAILABLE CONTENT TAGS (prefer these): ${existingContentTags.join(', ')}\nYou may create 1-2 NEW content tags only if the topic absolutely requires them. If the lesson you are making is already covered by one of the tags, just use the tags available. If you must, do not create similar tags, but create completely separate tag categories from the available ones if absolutely necessary for the new lesson. `
        : '';

    const messages = [
      {
        role: 'system' as const,
        content: `You are a native Mandarin speaker and a senior Mandarin curriculum and lesson designer with much creativity in creating engaging lessons types and topics. Generate long, engaging lessons strictly as JSON. Do not include any extra commentary.
          
          - **Content Requirements:**
            - Embed the entire story around the user-supplied TOPIC.
            ${timeframeConditioning}
            - The story must progress at a pace suited to the specified HSK level, introducing and reinforcing level-appropriate vocabulary and grammar, but with occasional inclusion of a few "stretch" words/structures.
            - Promote gradual learning by organizing the story in a way that helps learners follow and understand (logical sequence, appropriate complexity for HSK level).
            - Be creative and use storytelling techniques that engage learners emotionally and intellectually (e.g., character motivation, some conflict/resolution, surprise, or humor if suited)
            
        Generate lesson content first. 
        IMPORTANT: Ignore all tag-related instructions until AFTER you complete the lesson generation.`,
      },
      {
        role: 'user' as const,
        content: `Generate a Mandarin Chinese story lesson tailored to HSK level ${level}. Tell a coherent, engaging story strictly about the TOPIC. Length target: ~${approxChars} characters. Provide rich content. Use HSK-${level} vocab and grammar, with a few stretch words.${topicLine}

        === TAG ASSIGNMENT (DO THIS LAST) ===
        Only after completing the lesson generation above, assign appropriate tags to the lesson.
        After creating the lesson, Use the available tags to create the appropriate tags for the lesson. Do not let the available tags influence your creation of the lesson. Only after creating the lesson may you check and assign the tags to the generated lesson. Use the tags available only if it is absolutely relevant to the lesson you have just created.${availableTagsText}

        Return ONLY valid JSON with EXACTLY these keys (no extra keys, no comments):
        {
          "title": "string",
          "titlePinyin": "string <using tone marks>",
          "titleTranslation": "string",
          "lessonType": "story",
          "level": ${level},
          "tags": ["${timeframe}", "content_tag_1", "content_tag_2<optional, only add if absolutely necessary>"],
          "story": {
            "hanzi": "string (full Chinese text)",
            "translation": "string (full English translation; mirror paragraph breaks with blank lines)"
          },
          "namedEntities": [
            { "hanzi": "string", "pinyin": "string<using tone marks>", "translation": "string<in english>", "kind": "person|title|brand|org|location|phrase|event|festival" } <list main characters, locations, brands, organizations, title phrases, events, festivals introduced (as relevant to the story)> 
          ]
        }`,
      },
    ];
    const completion = await client.chat.completions.create({
      model: preferredModel,
      messages: messages as any,
      response_format: { type: 'json_object' },
    } as any);
    const content = completion.choices[0].message.content;
    if (!content) throw new Error('Empty OpenAI response');
    return JSON.parse(content);
  }

  private async openaiGenerateDialogueLesson({
    level,
    readTimeMinutes,
    topic,
    timeframe,
  }: {
    level: number;
    readTimeMinutes: number;
    topic?: string;
    timeframe: 'modern' | 'mythic' | 'imperial' | 'pre_modern' | 'futuristic';
  }) {
    const preferredModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const client = (this.openAIService as any)
      .openai as import('openai').default;
    const approxTurns = Math.max(
      Math.min(Math.floor(readTimeMinutes * 2), 22),
      12,
    );
    const topicLine = topic
      ? `\nTOPIC (mandatory): ${topic}\n.Use realistic, practical daily-life conversation turns strictly about the TOPIC. Each turn should naturally advance a situation revolving around the TOPIC. Include topic-specific vocabulary in the vocabulary list.`
      : `\nNo topic provided: choose a practical everyday-life scenario (not generic).`;
    const timeframeConditioning = this.getTimeframeConditioning(timeframe);

    // Get existing content tags to prefer in generation
    const existingContentTags = await this.getExistingContentTags();
    const availableTagsText =
      existingContentTags.length > 0
        ? `\n\nAVAILABLE CONTENT TAGS (prefer these): ${existingContentTags.join(', ')}\nYou may create 1-2 NEW content tags only if the topic genuinely requires them. If the lesson you are making is already covered by one of the tags, just use the tags available. If you must, do not create similar tags, but create completely separate tag categories from the available ones if absolutely necessary for the new lesson.`
        : '';

    const messages = [
      {
        role: 'system' as const,
        content: `You are a native Mandarin speaker and an expert Mandarin lesson designer. Your task is to generate an engaging, topical, practical Mandarin DIALOGUE lesson about the user-supplied TOPIC, tailored for the specified HSK level and focused on realistic learning objectives.
          
          - **Topicality & Engagement**:
            - The entire dialogue must revolve around and deeply explore the TOPIC. Keep the flow realistic and practical.
            ${timeframeConditioning}
            - Ensure the dialogue is contextually engaging—use light conflict, diverse opinions, practical needs, humor, or surprise if suited to the topic and learners' level.
            
          - **Quality and Pedagogy**:
            - The dialogue must be achievable for a learner at the specified HSK level, with scaffolding achieved through clear progression and repeated or paraphrased information.
            - Avoid unnatural or overly simplistic exchanges; ensure each turn moves the scenario forward and offers learning value.
            
            ## Reasoning Process
            Before constructing your dialogue:
            1. Internally analyze the TOPIC, HSK level, and recent/quasi-contemporary context to shape a realistic scenario.
            2. Determine character types, main communicative goal(s), likely challenges, and learning value.
            3. Select or invent core and stretch vocabulary with high topicality and utility for learners.
            4. Ensure dialogue pacing, complexity, and vocabulary align with HSK level objectives.
            5. **Do not output your reasoning—apply it only to craft your JSON.**
          
          Generate lesson content first. 
          IMPORTANT: Ignore all tag-related instructions until AFTER you complete the lesson generation.`,
      },
      {
        role: 'user' as const,
        content: `Generate a Mandarin Chinese dialogue lesson tailored to HSK level ${level}. Provide ${approxTurns} turns of natural conversation. Use HSK-${level} vocab and grammar, with a few stretch words.  
        TOPIC (mandatory): ${topicLine}  
        Use realistic, practical daily-life conversation turns strictly about the TOPIC. Each turn should naturally advance a situation revolving around the TOPIC.

        === TAG ASSIGNMENT (DO THIS LAST) ===
        Only after completing the lesson generation above, assign appropriate tags to the lesson.
        After creating the dialogue lesson, Use the available tags to create the appropriate tags for the lesson. Do not let the available tags influence your creation of the lesson. Only after creating the lesson may you check and assign the tags to the generated lesson. Use the tags available only if it is absolutely relevant to the lesson you have just created.${availableTagsText}

        Return ONLY valid JSON with EXACTLY these keys (no extra keys, no comments):
        {
          "title": "string",
          "titlePinyin": "string",
          "titleTranslation": "string",
          "lessonType": "dialogue",
          "level": ${level},
          "tags": ["${timeframe}", "content_tag_1", "content_tag_2<optional, only add if absolutely necessary>"],
          "dialogue": {
            "turns": [ // 18-22 turns of practical daily conversation suitable for HSK-${level}
              { "speaker": "<Character name or role(could be narrator or third person or other roles befitting the scenario)>", "hanzi": "string", "translation": "string" }
              // ...repeat until at least ${approxTurns} turns
            ]
          },
          "namedEntities": [
            { "hanzi": "string", "pinyin": "string<using tone marks>", "translation": "string<in english>", "kind": "person|title|brand|org|location|phrase|event|festival" }
            // ...all topic-specific and stretch words/phrases
          ]
        }
        (Note: Real dialogues must hit the requested turn count with plausible, progressively unfolding conversation. Some turns may be longer or shorter depending on authenticity.)
        Choose appropriate roles for speakers: e.g., named characters, service staff, family members, etc. Use names, titles, or role descriptors as needed for realism.

        - The title MUST include a keyword from the TOPIC (if provided).
        - Keep JSON concise but content-rich. No markdown, no commentary, JSON only.
        
        **REMINDER:**  
        Your main goal is to create a realistic, engaging, educational dialogue strictly about the supplied topic, perfectly matched to the learner's HSK level, turning the scenario into a practical lesson—all output as valid, strict JSON.`,
      },
    ];
    const completion = await client.chat.completions.create({
      model: preferredModel,
      messages: messages as any,
      response_format: { type: 'json_object' },
    } as any);
    const content = completion.choices[0].message.content;
    if (!content) throw new Error('Empty OpenAI response');
    return JSON.parse(content);
  }

  private fillSegmentPinyinFromLine(
    hanzi: string,
    pinyinLine: string,
    segments: Array<{
      text: string;
      startIndex: number;
      endIndex: number;
      isWord: boolean;
      hskLevel?: number;
      pinyin?: string;
      definition?: string;
    }>,
  ) {
    // Split pinyin syllables by whitespace; align to Chinese characters only
    const syllables = (pinyinLine || '')
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const charToPinyin: (string | undefined)[] = [];
    let idx = 0;
    for (let i = 0; i < hanzi.length; i++) {
      const ch = hanzi[i];
      // Consider CJK as needing a syllable; others get no syllable
      if (this.isChineseChar(ch)) {
        charToPinyin[i] = syllables[idx] || undefined;
        idx++;
      } else {
        charToPinyin[i] = undefined;
      }
    }

    return segments.map((s) => {
      if (!s.isWord || (s.pinyin && s.pinyin.length > 0)) return s;
      const start = Math.max(0, s.startIndex);
      const end = Math.max(start, s.endIndex);
      const joined = charToPinyin.slice(start, end).filter(Boolean).join(' ');
      if (joined && joined.length > 0) {
        return { ...s, pinyin: joined };
      }
      return s;
    });
  }

  private isChineseChar(char: string): boolean {
    const code = char.charCodeAt(0);
    return (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df)
    );
  }

  private async enrichTextWithSegments(text?: string, pinyin?: string) {
    if (!text || !Array.from(text).some((c) => this.isChineseChar(c)))
      return undefined as any[] | undefined;
    const segs = await this.segmentationService.segmentText(text);
    const charPinyinArray = (pinyin || '')
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const segments = segs.map((s) => {
      let segPinyin = (s.pinyin || '').toLowerCase();
      if (!segPinyin || segPinyin.trim().length === 0) {
        const slice = charPinyinArray
          .slice(s.startIndex, s.endIndex)
          .filter((_, idx) => this.isChineseChar(text[s.startIndex + idx]))
          .filter((p) => (p || '').trim().length > 0);
        if (slice.length > 0) segPinyin = slice.join(' ');
      }
      const segPinyinTone = toToneMarks(segPinyin);
      return {
        text: s.word,
        startIndex: s.startIndex,
        endIndex: s.endIndex,
        isWord: s.isWord,
        hskLevel: s.hskLevel,
        pinyin: segPinyinTone,
        definition: s.definition,
        definitions: s.definitions,
      };
    });
    return segments;
  }

  private async enrichNotesWithSegments(notes: any) {
    if (!notes || typeof notes !== 'object') return notes;
    if (Array.isArray(notes.grammarNotes)) {
      for (const n of notes.grammarNotes) {
        if (typeof n?.point === 'string') {
          n.pointSegments = await this.enrichTextWithSegments(
            n.point,
            n.pointPinyin,
          );
        }
        if (typeof n?.brief === 'string') {
          n.briefSegments = await this.enrichTextWithSegments(
            n.brief,
            n.briefPinyin,
          );
        }
        if (Array.isArray(n?.examples)) {
          for (const ex of n.examples) {
            if (typeof ex?.zh === 'string') {
              ex.segments = await this.enrichTextWithSegments(ex.zh, ex.pinyin);
            }
          }
        }
      }
    }
    return notes;
  }

  // Tag normalization and management utilities
  private normalizeTag(tag: string): string {
    return tag
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // collapse multiple spaces
      .replace(/[^a-z0-9 ]/g, '') // only alphanumeric and spaces
      .substring(0, 20); // max 20 chars
  }

  private normalizeTags(tags: string[]): string[] {
    const normalized = tags
      .map((tag) => this.normalizeTag(tag))
      .filter((tag) => tag.length > 0)
      .filter((tag, index, arr) => arr.indexOf(tag) === index); // dedupe

    return normalized.slice(0, 4); // cap at 4 tags
  }

  private getTagSynonyms(): Map<string, string> {
    const synonyms = new Map<string, string>();
    synonyms.set('tech', 'technology');
    synonyms.set('uni', 'university');
    synonyms.set('school', 'education');
    synonyms.set('work', 'career');
    synonyms.set('job', 'career');
    synonyms.set('travel', 'trip');
    synonyms.set('food', 'dining');
    synonyms.set('restaurant', 'dining');
    synonyms.set('hospital', 'medical');
    synonyms.set('doctor', 'medical');
    synonyms.set('health', 'medical');
    synonyms.set('love', 'romance');
    synonyms.set('dating', 'romance');
    synonyms.set('sport', 'sports');
    synonyms.set('game', 'gaming');
    synonyms.set('music', 'entertainment');
    synonyms.set('movie', 'entertainment');
    synonyms.set('film', 'entertainment');
    synonyms.set('book', 'reading');
    synonyms.set('study', 'education');
    synonyms.set('learn', 'education');
    return synonyms;
  }

  private applyTagSynonyms(tags: string[]): string[] {
    const synonyms = this.getTagSynonyms();
    return tags.map((tag) => synonyms.get(tag) || tag);
  }

  async getAvailableTags(): Promise<{
    timeframe: Array<{ tag: string; count: number }>;
    content: Array<{ tag: string; count: number }>;
  }> {
    const timeframeTags = [
      'modern',
      'mythic',
      'imperial',
      'pre_modern',
      'futuristic',
    ];

    // Get all tags with counts
    const queryResult = await this.prismaService.$queryRaw<
      Array<{ tag: string; count: bigint }>
    >`
      SELECT unnest(tags) as tag, COUNT(*) as count
      FROM "Lesson"
      WHERE array_length(tags, 1) > 0
      GROUP BY unnest(tags)
      ORDER BY count DESC, tag ASC
      LIMIT 50
    `;

    const allTags = queryResult.map((row) => ({
      tag: row.tag,
      count: Number(row.count),
    }));

    // Separate timeframe and content tags
    const timeframeTagsWithCounts = timeframeTags.map((tag) => {
      const found = allTags.find((t) => t.tag === tag);
      return { tag, count: found ? found.count : 0 };
    });

    const contentTags = allTags.filter(
      (tagObj) => !timeframeTags.includes(tagObj.tag),
    );

    const result = { timeframe: timeframeTagsWithCounts, content: contentTags };
    return result;
  }

  async getTagCounts(): Promise<Record<string, number>> {
    const result = await this.prismaService.$queryRaw<
      Array<{ tag: string; count: bigint }>
    >`
      SELECT unnest(tags) as tag, COUNT(*) as count
      FROM "Lesson"
      WHERE array_length(tags, 1) > 0
      GROUP BY unnest(tags)
    `;

    const counts: Record<string, number> = {};
    result.forEach((row) => {
      counts[row.tag] = Number(row.count);
    });

    return counts;
  }

  private async getExistingContentTags(): Promise<string[]> {
    const counts = await this.getTagCounts();
    const timeframeTags = [
      'modern',
      'mythic',
      'imperial',
      'pre_modern',
      'futuristic',
    ];

    return Object.keys(counts)
      .filter((tag) => !timeframeTags.includes(tag))
      .sort((a, b) => counts[b] - counts[a])
      .slice(0, 50); // top 50 by frequency
  }
}
