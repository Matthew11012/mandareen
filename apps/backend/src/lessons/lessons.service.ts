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
                })
              : await this.openaiGenerateStoryLesson({
                  level,
                  readTimeMinutes,
                  topic,
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

            emit('step', { key: 'rag_retrieve_context' });
            let grammarNotes: any[] | undefined;
            let tipsRichOut:
              | Array<{ zh: string; en?: string; segments?: any[] }>
              | undefined;
            try {
              const fullDialogue = turns.map((t: any) => t.hanzi).join('\n');
              const ctx = await this.ragService.retrieveForLesson(user.id, {
                topic: topic || generated.title || undefined,
                level,
              });
              emit('step', { key: 'openai_generate_grammar_notes' });
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
              grammarNotes = Array.isArray((notes as any).grammarNotes)
                ? (notes as any).grammarNotes
                : undefined;
              tipsRichOut = Array.isArray((notes as any).tipsRich)
                ? (notes as any).tipsRich
                : undefined;
            } catch {
              // best-effort: still advance so UI can proceed
              emit('step', { key: 'segment_grammar_notes_and_tips' });
            }

            // Upsert named entities into vocabulary (dialogue)
            if (
              Array.isArray(dedupNamedEntities) &&
              dedupNamedEntities.length > 0
            ) {
              this.logger.log(
                `Upserting ${dedupNamedEntities.length} named entities (dialogue)`,
              );
              for (const ne of dedupNamedEntities) {
                try {
                  await this.prismaService.vocabularyItem.upsert({
                    where: { hanzi: ne.text },
                    create: {
                      hanzi: ne.text,
                      pinyin: (ne.pinyin || '').toLowerCase(),
                      definition: (ne.definition || '').toString(),
                      isCustom: true,
                      source: 'LLM-NE',
                    } as any,
                    update: {
                      pinyin: (ne.pinyin || '').toLowerCase(),
                      definition: (ne.definition || '').toString() || undefined,
                    } as any,
                  });
                } catch (err) {
                  this.logger.warn(
                    `Failed to upsert named entity ${ne.text} into vocabulary`,
                    err as any,
                  );
                }
              }
            }

            emit('step', { key: 'persist_lesson' });
            const created = await this.prismaService.lesson.create({
              data: {
                level,
                title: generated.title || null,
                createdBy: user.email,
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
                      },
                    },
                  ],
                },
              },
              select: { id: true },
            });
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

          // Upsert named entities into vocabulary (story - streaming)
          if (Array.isArray(namedEntities) && namedEntities.length > 0) {
            const seenNeStream = new Set<string>();
            const dedupNeStream = namedEntities.filter((e: any) => {
              if (seenNeStream.has(e.text)) return false;
              seenNeStream.add(e.text);
              return true;
            });
            this.logger.log(
              `Upserting ${dedupNeStream.length} named entities (story-stream)`,
            );
            for (const ne of dedupNeStream) {
              try {
                await this.prismaService.vocabularyItem.upsert({
                  where: { hanzi: ne.text },
                  create: {
                    hanzi: ne.text,
                    pinyin: (ne.pinyin || '').toLowerCase(),
                    definition: (ne.definition || '').toString(),
                    isCustom: true,
                    source: 'LLM-NE',
                  } as any,
                  update: {
                    pinyin: (ne.pinyin || '').toLowerCase(),
                    definition: (ne.definition || '').toString() || undefined,
                  } as any,
                });
              } catch (err) {
                this.logger.warn(
                  `Failed to upsert named entity ${ne.text} into vocabulary`,
                  err as any,
                );
              }
            }
          }

          emit('step', { key: 'openai_generate_grammar_notes' });
          let grammarNotes2: any[] | undefined;
          let tipsRichOut2:
            | Array<{ zh: string; en?: string; segments?: any[] }>
            | undefined;
          try {
            const ctx = await this.ragService.retrieveForLesson(user.id, {
              topic: topic || (generated as any).title || undefined,
              level,
            });
            const profile = await this.ragService.getUserProfile(user.id);
            let notes = await (this.openAIService as any).generateGrammarNotes(
              (generated as any).story?.hanzi || '',
              {
                level: profile.level,
                strugglingWords: profile.strugglingWords,
                contextText: ctx?.contextText,
              },
            );
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
            grammarNotes2 = Array.isArray((notes as any).grammarNotes)
              ? (notes as any).grammarNotes
              : undefined;
            tipsRichOut2 = Array.isArray((notes as any).tipsRich)
              ? (notes as any).tipsRich
              : undefined;
          } catch (e) {
            this.logger.warn(
              'Error generating grammar notes for story',
              e as any,
            );
            emit('step', { key: 'segment_grammar_notes_and_tips' });
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
          const created = await this.prismaService.lesson.create({
            data: {
              level,
              title: (generated as any).title || null,
              createdBy: user.email,
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
                    },
                  },
                ],
              },
            },
            select: { id: true },
          });
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

    const generated =
      type === 'dialogue'
        ? await this.openaiGenerateDialogueLesson({
            level,
            readTimeMinutes,
            topic,
          })
        : await this.openaiGenerateStoryLesson({
            level,
            readTimeMinutes,
            topic,
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

      // Optionally compute grounded grammar notes for the whole dialogue text
      let grammarNotes: any[] | undefined;
      let tipsRichOut:
        | Array<{ zh: string; en?: string; segments?: any[] }>
        | undefined;
      try {
        const fullDialogue = turns.map((t: any) => t.hanzi).join('\n');
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
        // Enrich notes with segments for clickable tokens
        notes = await this.enrichNotesWithSegments(notes as any);
        // Also enrich tips into tipsRich with segments
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
        grammarNotes = Array.isArray((notes as any).grammarNotes)
          ? (notes as any).grammarNotes
          : undefined;
        // attach tipsRich to be stored with section content
        tipsRichOut = Array.isArray((notes as any).tipsRich)
          ? (notes as any).tipsRich
          : undefined;
      } catch (err) {
        // best-effort, log and continue
        this.logger.warn('Named entity upsert failed (dialogue)', err as any);
      }

      // Upsert named entities into vocabulary (dialogue)
      if (Array.isArray(dedupNamedEntities) && dedupNamedEntities.length > 0) {
        this.logger.log(
          `Upserting ${dedupNamedEntities.length} named entities (dialogue)`,
        );
        for (const ne of dedupNamedEntities) {
          try {
            await this.prismaService.vocabularyItem.upsert({
              where: { hanzi: ne.text },
              create: {
                hanzi: ne.text,
                pinyin: (ne.pinyin || '').toLowerCase(),
                definition: (ne.definition || '').toString(),
                isCustom: true,
                source: 'LLM-NE',
              } as any,
              update: {
                pinyin: (ne.pinyin || '').toLowerCase(),
                definition: (ne.definition || '').toString() || undefined,
              } as any,
            });
          } catch (err) {
            this.logger.warn(
              `Failed to upsert named entity ${ne.text} into vocabulary`,
              err as any,
            );
          }
        }
      }

      lesson = await this.prismaService.lesson.create({
        data: {
          level,
          title: generated.title || null,
          createdBy: user.email,
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
                },
              },
            ],
          },
        },
        select: { id: true },
      });
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

      // Optionally compute grounded grammar notes for the story text
      let grammarNotes: any[] | undefined;
      let tipsRichOut2:
        | Array<{ zh: string; en?: string; segments?: any[] }>
        | undefined;
      try {
        const ctx = await this.ragService.retrieveForLesson(user.id, {
          topic: topic || generated.title || undefined,
          level,
        });
        const profile = await this.ragService.getUserProfile(user.id);
        let notes = await (this.openAIService as any).generateGrammarNotes(
          generated.story?.hanzi || '',
          {
            level: profile.level,
            strugglingWords: profile.strugglingWords,
            contextText: ctx?.contextText,
          },
        );
        // Enrich notes with segments for clickable tokens
        notes = await this.enrichNotesWithSegments(notes as any);
        // Also enrich tips into tipsRich with segments
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
        grammarNotes = Array.isArray((notes as any).grammarNotes)
          ? (notes as any).grammarNotes
          : undefined;
        tipsRichOut2 = Array.isArray((notes as any).tipsRich)
          ? (notes as any).tipsRich
          : undefined;
      } catch (err) {
        this.logger.warn('Error generating grammar notes', err as any);
      }

      // Upsert named entities into vocabulary (story)
      if (
        Array.isArray(dedupNamedEntities2) &&
        dedupNamedEntities2.length > 0
      ) {
        this.logger.log(
          `Upserting ${dedupNamedEntities2.length} named entities (story)`,
        );
        for (const ne of dedupNamedEntities2) {
          try {
            await this.prismaService.vocabularyItem.upsert({
              where: { hanzi: ne.text },
              create: {
                hanzi: ne.text,
                pinyin: (ne.pinyin || '').toLowerCase(),
                definition: (ne.definition || '').toString(),
                isCustom: true,
                source: 'LLM-NE',
              } as any,
              update: {
                pinyin: (ne.pinyin || '').toLowerCase(),
                definition: (ne.definition || '').toString() || undefined,
              } as any,
            });
          } catch (err) {
            this.logger.warn(
              `Failed to upsert named entity ${ne.text} into vocabulary`,
              err as any,
            );
          }
        }
      }

      lesson = await this.prismaService.lesson.create({
        data: {
          level,
          title: generated.title || null,
          createdBy: user.email,
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
                  grammarNotes,
                  tipsRich: (typeof tipsRichOut2 !== 'undefined'
                    ? tipsRichOut2
                    : undefined) as any,
                },
              },
            ],
          },
        },
        select: { id: true },
      });
    }

    return { id: lesson.id };
  }

  async listLessons(level?: number, levels?: number[]) {
    const where =
      levels && levels.length > 0
        ? { level: { in: levels } as any }
        : level
          ? { level }
          : undefined;
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
      } as any;
    });
  }

  async listLessonsByCreator(
    createdBy: string,
    level?: number,
    levels?: number[],
  ) {
    const byLevel =
      levels && levels.length > 0
        ? { level: { in: levels } as any }
        : level
          ? { level }
          : {};
    const lessons = await this.prismaService.lesson.findMany({
      where: {
        ...byLevel,
        createdBy,
      },
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
    // Fetch finished progresses with lesson level to aggregate in-memory.
    const rows = await (this.prismaService as any).lessonProgress.findMany({
      where: { userId, finishedAt: { not: null } },
      select: { lesson: { select: { level: true } } },
    });
    const counts: Record<number, number> = {};
    for (const r of rows) {
      const lvl: number | undefined = r?.lesson?.level;
      if (!lvl) continue;
      counts[lvl] = (counts[lvl] || 0) + 1;
    }
    return counts;
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
    // Fetch finishedAt timestamps for the user, newest first
    const progresses: Array<{ finishedAt: Date | null }> = await (
      this.prismaService as any
    ).lessonProgress.findMany({
      where: { userId, finishedAt: { not: null } },
      select: { finishedAt: true },
      orderBy: { finishedAt: 'desc' },
    });

    if (!progresses || progresses.length === 0) return 0;

    // Build a set of LOCAL date keys (YYYY-MM-DD) for fast lookup; multiple finishes per day count once
    const finishedDays = new Set<string>();
    for (const p of progresses) {
      if (!p.finishedAt) continue;
      const shifted = new Date(p.finishedAt.getTime() + offsetMinutes * 60_000);
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
  }: {
    level: number;
    readTimeMinutes: number;
    topic?: string;
  }) {
    const preferredModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const client = (this.openAIService as any)
      .openai as import('openai').default;
    const approxChars = Math.min(readTimeMinutes * 300, 6000);
    const topicLine = topic
      ? `\nTOPIC (mandatory): ${topic}\n.You MUST center the entire story on this TOPIC. The title MUST include at least one keyword from the topic. Use domain-specific vocabulary related to the topic and include those items in the vocabulary list.`
      : `\nNo topic provided: choose a fresh everyday-life theme distinct from generic themes. Avoid those unless explicitly requested.`;
    const messages = [
      {
        role: 'system' as const,
        content: `You are a native Mandarin speaker and a senior Mandarin curriculum and lesson designer with much creativity in creating engaging lessons types and topics. Generate long, engaging lessons strictly as JSON. Do not include any extra commentary.
          
          - **Content Requirements:**
            - Embed the entire story around the user-supplied TOPIC.
            - If possible, infuse the story with inspiration from current events, trends, or recent cultural happenings (news, pop culture, popular activities, contemporary issues) relevant to the topic and appropriate for the specified HSK level.
            - The story must progress at a pace suited to the specified HSK level, introducing and reinforcing level-appropriate vocabulary and grammar, but with occasional inclusion of a few “stretch” words/structures.
            - Promote gradual learning by organizing the story in a way that helps learners follow and understand (logical sequence, appropriate complexity for HSK level).
            - Be creative and use storytelling techniques that engage learners emotionally and intellectually (e.g., character motivation, some conflict/resolution, surprise, or humor if suited)`,
      },
      {
        role: 'user' as const,
        content: `Generate a Mandarin Chinese story lesson tailored to HSK level ${level}. Tell a coherent, engaging story strictly about the TOPIC. Length target: ~${approxChars} characters. Provide rich content. Use HSK-${level} vocab and grammar, with a few stretch words.${topicLine}

        Return ONLY valid JSON with EXACTLY these keys (no extra keys, no comments):
        {
          "title": "string",
          "titlePinyin": "string <using tone marks>",
          "titleTranslation": "string",
          "lessonType": "story",
          "level": ${level},
          "story": {
            "hanzi": "string (full Chinese text)",
            "translation": "string (full English translation; mirror paragraph breaks with blank lines)"
          },
          "namedEntities": [
            { "hanzi": "string", "pinyin": "string", "translation": "string<in english>", "kind": "person|title|brand|org|location|phrase|event|festival" } <list main characters, locations, brands, organizations, title phrases, events, festivals introduced (as relevant to the story)> 
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
  }: {
    level: number;
    readTimeMinutes: number;
    topic?: string;
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
    const messages = [
      {
        role: 'system' as const,
        content: `You are a native Mandarin speaker and an expert Mandarin lesson designer. Your task is to generate an engaging, topical, practical Mandarin DIALOGUE lesson about the user-supplied TOPIC, tailored for the specified HSK level and focused on realistic learning objectives.
          
          - **Topicality & Engagement**:
            - The entire dialogue must revolve around and deeply explore the TOPIC. Keep the flow realistic and practical.
            - If possible, incorporate current events, trends, pop culture, or recent news relevant to the TOPIC and suitable for the HSK level.
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
            5. **Do not output your reasoning—apply it only to craft your JSON.**`,
      },
      {
        role: 'user' as const,
        content: `Generate a Mandarin Chinese dialogue lesson tailored to HSK level ${level}. Provide ${approxTurns} turns of natural conversation. Use HSK-${level} vocab and grammar, with a few stretch words.  
        TOPIC (mandatory): ${topicLine}  
        Use realistic, practical daily-life conversation turns strictly about the TOPIC. Each turn should naturally advance a situation revolving around the TOPIC.

        Return ONLY valid JSON with EXACTLY these keys (no extra keys, no comments):
        {
          "title": "string",
          "titlePinyin": "string",
          "titleTranslation": "string",
          "lessonType": "dialogue",
          "level": ${level},
          "dialogue": {
            "turns": [ // 18-22 turns of practical daily conversation suitable for HSK-${level}
              { "speaker": "<Character name or role(could be narrator or third person or other roles befitting the scenario)>", "hanzi": "string", "translation": "string" }
              // ...repeat until at least ${approxTurns} turns
            ]
          },
          "namedEntities": [
            { "hanzi": "string", "pinyin": "string", "translation": "string<in english>", "kind": "person|title|brand|org|location|phrase|event|festival" }
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
}
