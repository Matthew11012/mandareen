import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { toToneMarks } from '../utils/pinyin';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../openai/openai.service';
import { Observable } from 'rxjs';
import { SegmentationService } from '../vocabulary/segmentation.service';
import { RagService } from '../rag/rag.service';
import { UsageService } from '../billing/usage.service';
import { BillingPlanService } from '../billing/billing-plan.service';
import { BILLING_RESOURCES } from '../billing/billing-resources.constants';
import * as mm from 'music-metadata';

export type MessageNotes = {
  grammarNotes?: any;
  tips?: string[];
  tipsRich?: any[];
  citations?: any[];
};

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAIService,
    private readonly segmentationService: SegmentationService,
    private readonly rag: RagService,
    private readonly usageService: UsageService,
    private readonly billingPlanService: BillingPlanService,
  ) {
    void prisma;
    void openai;
    void segmentationService;
    void rag;
    void usageService;
    void billingPlanService;
  }

  async startConversation(userId: number) {
    const convo = await this.prisma.conversation.create({
      data: {
        userId,
      },
    });
    return convo;
  }

  async listMessages(conversationId: number) {
    const msgs = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    // Attach segmentation for AI messages so frontend can render multi-word clickable tokens
    const enriched = await Promise.all(
      msgs.map(async (m) => {
        try {
          const text = m.hanzi || '';
          const hasChinese = Array.from(text).some((ch) =>
            this.isChineseChar(ch),
          );
          if (!hasChinese) return m as any;
          const segs = await this.segmentationService.segmentText(text);
          const charPinyinArray = (m.pinyin || '')
            .split(/\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
          const segments = segs.map((s) => {
            let segPinyin = (s.pinyin || '').toLowerCase();
            if (!segPinyin || segPinyin.trim().length === 0) {
              const hann = text as string;
              const slice = charPinyinArray
                .slice(s.startIndex, s.endIndex)
                .filter((_, idx) =>
                  this.isChineseChar(hann[s.startIndex + idx]),
                )
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
          return { ...(m as any), segments };
        } catch {
          return m as any;
        }
      }),
    );
    return enriched as any;
  }

  async listUserConversations(userId: number) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      include: {
        messages: {
          select: { id: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async deleteUserConversation(
    userId: number,
    conversationId: number,
  ): Promise<boolean> {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conv) {
      throw new NotFoundException();
    }
    await this.prisma.conversation.delete({
      where: { id: conversationId },
    });
    return true;
  }

  async sendUserMessage({
    conversationId,
    userId,
    hanzi,
  }: {
    conversationId: number;
    userId: number;
    hanzi: string;
  }) {
    // Verify conversation ownership (or create one if none exists)
    let convo = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!convo) {
      // Fallback: create if not found
      convo = await this.prisma.conversation.create({ data: { userId } });
    }
    const userMsg = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        hanzi,
        pinyin: '',
        translation: '',
      },
    });
    // Return quickly; AI reply will be produced via SSE stream, and user enrichment will be sent via SSE as well
    return { user: userMsg } as any;
  }

  /**
   * Calculate audio duration in seconds from a buffer.
   * Uses music-metadata to parse audio file metadata.
   */
  private async calculateAudioDuration(
    audioBuffer: Buffer,
    mimeType: string,
  ): Promise<number> {
    try {
      const metadata = await mm.parseBuffer(audioBuffer, {
        mimeType: mimeType || 'audio/webm',
      });
      const duration = metadata.format.duration;
      if (duration && duration > 0) {
        return Math.ceil(duration); // Round up to nearest whole second
      }
      // Fallback: estimate based on file size (rough approximation)
      // Assume ~16kbps bitrate for webm/opus
      const estimatedDuration = Math.ceil((audioBuffer.length * 8) / 16000);
      this.logger.warn(
        `Could not parse audio duration, using estimation: ${estimatedDuration}s`,
      );
      return Math.max(1, estimatedDuration); // Minimum 1 second
    } catch (error) {
      // Fallback: estimate based on file size
      const estimatedDuration = Math.ceil((audioBuffer.length * 8) / 16000);
      this.logger.warn(
        `Failed to parse audio duration: ${error}. Using estimation: ${estimatedDuration}s`,
      );
      return Math.max(1, estimatedDuration); // Minimum 1 second
    }
  }

  async sendUserAudioMessage({
    conversationId,
    userId,
    audioBuffer,
    mimeType,
  }: {
    conversationId: number;
    userId: number;
    audioBuffer: Buffer;
    mimeType: string;
  }) {
    let convo = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!convo) {
      convo = await this.prisma.conversation.create({ data: { userId } });
    }

    // 1) Calculate audio duration
    const audioDurationSeconds = await this.calculateAudioDuration(
      audioBuffer,
      mimeType,
    );
    // 2) Fetch quota for usage metering (no logging needed)
    const resource = BILLING_RESOURCES.CONVO_TTS_SECONDS;
    const limit = await this.billingPlanService.getLimit(userId, resource);

    // 3) Perform STT transcription
    const hanzi = await (this.openai as any).transcribeAudio(
      audioBuffer,
      mimeType,
    );

    // 4) Create user message
    const userMsg = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        hanzi,
        pinyin: '',
        translation: '',
      },
    });

    // 5) Record audio duration usage after successful STT and message creation
    if (limit && limit.monthlyCap > 0) {
      try {
        await this.usageService.recordUsage({
          userId,
          resource,
          amount: audioDurationSeconds,
          idempotencyKey: `stt:${userId}:${userMsg.id}`,
          metadata: {
            conversationId,
            messageId: userMsg.id,
            type: 'audio_input',
            durationSeconds: audioDurationSeconds,
          },
        });
      } catch (error) {
        this.logger.warn(
          'Failed to record STT audio usage (input metering)',
          error as Error,
        );
      }
    }

    return { user: userMsg } as any;
  }

  streamReply({
    conversationId,
    userId,
    hanzi,
  }: {
    conversationId: number;
    userId: number;
    hanzi: string;
  }): Observable<{ data: string } | { event: string; data: any }> {
    return new Observable((subscriber) => {
      (async () => {
        let latestUserMessageId: number | null = null;
        let latestUserSegments: Array<{
          text: string;
          startIndex: number;
          endIndex: number;
          isWord: boolean;
          hskLevel?: number;
          pinyin?: string;
          definition?: string;
          definitions?: string[];
        }> | null = null;
        let latestUserPinyin = '';
        try {
          let convo = await this.prisma.conversation.findFirst({
            where: { id: conversationId, userId },
          });
          if (!convo) {
            convo = await this.prisma.conversation.create({ data: { userId } });
          }

          // DO NOT create a duplicate user message here; the POST /messages already did.

          // Minimal reasoning prompt already configured in OpenAIService; use streaming
          const client = (this.openai as any)
            .openai as import('openai').default;
          const model =
            process.env.OPENAI_MODEL_CONVERSATION_REPLY || 'gpt-4o-mini';
          // Include brief context (last 5 messages + current user) for improved continuity
          const prev = await this.prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
            take: 10,
          });
          const history = prev.reverse().map((m) => ({
            role:
              m.role === 'user' ? ('user' as const) : ('assistant' as const),
            content: m.hanzi,
          }));
          // Do not push the same user content twice; latest user message is already included
          const responseInput = [
            {
              role: 'system',
              content: [
                {
                  type: 'input_text',
                  text: `Respond as a native Mandarin speaker engaging in friendly daily conversation practice. Make your replies sound as natural and casual as possible, as if chatting with a close friend. Replies should be concise and brief—no longer than 1-2 short sentences(10-30 Chinese characters)—to mirror real, day-to-day exchanges and help conserve audio usage. Add small touches of humor, fun facts, cultural things or relatable details if they naturally fit the flow of conversation. If the user types in Traditional Chinese characters, always convert them to Simplified in your response. Do NOT provide pinyin, translation, or any additional explanations—just output your reply in Simplified Chinese characters, nothing else.
                  
                  Reason step-by-step internally about the most natural, friendly, and context-appropriate way to reply before generating your response.
                  Persist in this manner throughout the session.

                  **Output instructions:**
                  - Output ONLY Simplified Chinese characters in a short, natural sentence.
                  - Do not include pinyin, translation, or formatting.
                  - Keep each reply to no more than 1-2 concise natural-sounding sentences.

                  **Examples**

                  *Example 1*

                  User: 你今天过得怎么样？
                  Assistant internal reasoning: The user is asking how my day was. Friends often reply with a brief, light tone, maybe mention something ordinary and add a bit of humor.
                  Assistant output: 还不错，就是早上又忘了带伞，差点变成“落汤鸡”！

                  *Example 2*

                  User: 最近有什么新鲜事吗？
                  Assistant internal reasoning: The user is asking about recent news. A friend might mention something personal or a fun detail.
                  Assistant output: 昨天试了家新开的奶茶店，居然送了我一只小熊杯垫！

                  *Example 3*

                  User: 明天有空吗？要不要一起吃饭？
                  Assistant internal reasoning: The friend is inviting me to eat. I can accept, making it friendly and concise.
                  Assistant output: 有空啊！去哪儿吃好呢？

                  (For real interactions, make sure to keep responses this concise and context-appropriate, adapting humor/fun facts naturally when possible.)

                  **Important reminders:**  
                  - Respond only in Simplified Chinese characters.
                  - Replies must be brief, natural, and casual, like two friends chatting.
                  - If Traditional Chinese is used, convert to Simplified in your reply.
                  - Do not include pinyin, translation, or explanations.
                  - Reason internally before answering to ensure authentic, friend-like replies.

                  **REMINDER:**
                  Your goal is to reply in a friendly, concise, natural way in Simplified Chinese—just like a real Mandarin-speaking friend would in a brief chat. No pinyin or translations.
                  `,
                },
              ],
            },
            ...history.map((m) => ({
              role: m.role,
              content: [
                {
                  type: m.role === 'assistant' ? 'output_text' : 'input_text',
                  text: m.content,
                },
              ],
            })),
          ];

          const stream = await client.responses.stream({
            model,
            input: responseInput,
            metadata: {
              conversationId: conversationId.toString(),
            },
            reasoning: {
              effort: 'minimal',
            },
          } as any);

          let fullText = '';
          let completedResponse: any = null;

          for await (const event of stream as any) {
            if (!event || typeof event !== 'object') continue;
            const type = event.type as string | undefined;
            if (type === 'response.output_text.delta') {
              const delta = (event.delta as string) || '';
              if (!delta) continue;
              fullText += delta;
              subscriber.next({ data: JSON.stringify({ hanziDelta: delta }) });
            } else if (type === 'response.completed') {
              completedResponse = event.response;
            } else if (type === 'response.error') {
              const message =
                event?.error?.message || 'OpenAI response stream error';
              throw new Error(message);
            }
          }

          if (!completedResponse) {
            try {
              completedResponse = await stream.finalResponse();
            } catch {
              // ignore inability to fetch final response; rely on accumulated text
            }
          }

          if (!fullText && completedResponse) {
            fullText = this.extractTextFromResponseOutput(
              completedResponse?.output,
            );
          }

          // User message enrichment (pinyin + segments; translation filled after AI reply)
          // Ensure this emits before we send 'final' so the client doesn't miss it
          try {
            const text = hanzi;
            const hasChinese = Array.from(text).some((ch) =>
              this.isChineseChar(ch as any),
            );
            if (hasChinese) {
              const segs = await this.segmentationService.segmentText(text);
              const perCharPinyin =
                await this.computeSentencePinyinPerCharacter(text);
              const charPinyinArray = perCharPinyin
                .split(/\s+/)
                .map((s: string) => s.trim())
                .filter((s: string) => s.length > 0);
              const segments = segs.map((s) => {
                let segPinyin = (s.pinyin || '').toLowerCase();
                if (!segPinyin || segPinyin.trim().length === 0) {
                  const hann = text as string;
                  const slice = charPinyinArray
                    .slice(s.startIndex, s.endIndex)
                    .filter((_, idx) =>
                      this.isChineseChar(hann[s.startIndex + idx]),
                    )
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
              // Update latest user message with tone-mark pinyin
              const latestUser = await this.prisma.message.findFirst({
                where: { conversationId, role: 'user' },
                orderBy: { createdAt: 'desc' },
              });
              if (latestUser) {
                await this.prisma.message.update({
                  where: { id: latestUser.id },
                  data: {
                    pinyin: perCharPinyin || '',
                    translation: '',
                  },
                });
                latestUserMessageId = latestUser.id;
                latestUserSegments = segments;
                latestUserPinyin = perCharPinyin || '';
                // Emit a user-update event so frontend can show toggles immediately
                const userUpdatePayload = JSON.stringify({
                  id: latestUser.id,
                  segments,
                  pinyin: perCharPinyin || '',
                  translation: '',
                });
                // Default event for onmessage handlers
                subscriber.next({
                  data: JSON.stringify({
                    type: 'user-update',
                    data: userUpdatePayload,
                  }),
                });
                // Named event for addEventListener('user-update') handlers
                subscriber.next({
                  event: 'user-update',
                  data: userUpdatePayload,
                });
              }
            }
          } catch (err) {
            this.logger.warn('User enrichment failed', err as any);
          }

          // After stream ends, use streamed hanzi as-is; compute pinyin locally and request only translation
          const finalHanzi = fullText;
          const pinyinPerChar =
            await this.computeSentencePinyinPerCharacter(finalHanzi);
          // Build per-character array aligned to hanzi for segment pinyin filling
          const charPinyinArray =
            await this.computeSentencePinyinArray(finalHanzi);

          let vocabExtras: Array<{
            text: string;
            pinyin?: string;
            definition?: string;
            hskLevel?: number;
          }> = [];
          try {
            vocabExtras = await (this.openai as any).annotateChinese(
              finalHanzi,
            );
          } catch {
            // ignore annotate error and continue with base segmentation
          }
          const segs = await this.segmentationService.segmentText(
            finalHanzi,
            vocabExtras,
          );
          const segments = segs.map((s) => {
            let segPinyin = (s.pinyin || '').toLowerCase();
            if (!segPinyin || segPinyin.trim().length === 0) {
              const hann = finalHanzi as string;
              const slice = charPinyinArray
                .slice(s.startIndex, s.endIndex)
                .filter((_, idx) =>
                  this.isChineseChar(hann[s.startIndex + idx]),
                )
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

          subscriber.next({
            data: JSON.stringify({
              type: 'ai-enrichment',
              conversationId,
              pinyin: pinyinPerChar,
              segments,
            }),
          });

          let assistantTranslation = '';
          let userTranslationFromBatch: string | undefined = undefined;
          try {
            const translationEntries: Array<{
              role: 'user' | 'ai';
              text: string;
            }> = [];
            if (latestUserMessageId && hanzi) {
              translationEntries.push({ role: 'user', text: hanzi });
            }
            if (finalHanzi) {
              translationEntries.push({ role: 'ai', text: finalHanzi });
            }
            if (translationEntries.length > 0) {
              const translations = await (
                this.openai as any
              ).translateConversationEntries(translationEntries);
              assistantTranslation = translations.ai || '';
              userTranslationFromBatch = translations.user;
            }
          } catch (err) {
            this.logger.warn(
              'Batch translation failed; proceeding without translations',
              err as any,
            );
            assistantTranslation = '';
            userTranslationFromBatch = undefined;
          }

          if (
            latestUserMessageId &&
            typeof userTranslationFromBatch === 'string'
          ) {
            await this.prisma.message.update({
              where: { id: latestUserMessageId },
              data: { translation: userTranslationFromBatch },
            });
            const userUpdatePayload = JSON.stringify({
              id: latestUserMessageId,
              segments: latestUserSegments ?? undefined,
              pinyin: latestUserPinyin,
              translation: userTranslationFromBatch,
            });
            subscriber.next({
              data: JSON.stringify({
                type: 'user-update',
                data: userUpdatePayload,
              }),
            });
            subscriber.next({
              event: 'user-update',
              data: userUpdatePayload,
            });
          }

          subscriber.next({
            data: JSON.stringify({
              type: 'ai-translation',
              conversationId,
              translation: assistantTranslation,
            }),
          });

          // Create DB message now (with pinyin + translation, notes pending)
          const aiMsg = await this.prisma.message.create({
            data: {
              conversationId,
              role: 'ai',
              hanzi: finalHanzi,
              pinyin: pinyinPerChar || '',
              translation: assistantTranslation,
            },
          });

          // Emit ai-audio when TTS completes
          const audioPromise = this.generateAndSaveAudio(
            finalHanzi,
            conversationId,
            aiMsg.id,
            userId,
          )
            .then((audioUrl) => {
              subscriber.next({
                data: JSON.stringify({
                  type: 'ai-audio',
                  conversationId,
                  audioUrl,
                }),
              });
            })
            .catch((err) => {
              this.logger.warn(
                'TTS synthesis failed (progressive)',
                err as any,
              );
            });

          // Notes generation is now manual-only via the generate-notes endpoint
          // Removed automatic note generation to enforce quota

          // Wait for audio generation, then emit final
          await Promise.all([audioPromise]);
          subscriber.next({
            data: JSON.stringify({
              type: 'final',
              conversationId,
              complete: true,
            }),
          });
          subscriber.complete();
        } catch (e) {
          this.logger.error(
            'SSE streaming failed; attempting fallback',
            (e as any)?.stack || (e as any) || 'unknown error',
          );
          // Surface an error event to the client for visibility
          try {
            subscriber.next({
              event: 'error',
              data: { message: (e as any)?.message || 'stream failed' },
            });
          } catch {
            this.logger.debug(
              'Failed to emit SSE error event; client may have disconnected',
            );
          }
          try {
            // Fallback: attempt non-stream single-shot reply without previous deltas
            const fallback = await (this.openai as any).chatChineseReply(hanzi);
            const finalHanziFallback = fallback.hanzi || '';
            const pinyinPerChar =
              await this.computeSentencePinyinPerCharacter(finalHanziFallback);
            const charPinyinArray =
              await this.computeSentencePinyinArray(finalHanziFallback);
            // Try to enrich fallback with annotated vocabulary as well
            let vocabExtras2: Array<{
              text: string;
              pinyin?: string;
              definition?: string;
              hskLevel?: number;
            }> = [];
            try {
              vocabExtras2 = await (this.openai as any).annotateChinese(
                fallback.hanzi || '',
              );
            } catch {
              // ignore annotate error and continue with base segmentation
            }
            const segs2 = await this.segmentationService.segmentText(
              fallback.hanzi || '',
              vocabExtras2,
            );
            const segments2 = segs2.map((s) => {
              let segPinyin = (s.pinyin || '').toLowerCase();
              if (!segPinyin || segPinyin.trim().length === 0) {
                const hann = (fallback.hanzi || '') as string;
                const slice = charPinyinArray
                  .slice(s.startIndex, s.endIndex)
                  .filter((_, idx) =>
                    this.isChineseChar(hann[s.startIndex + idx]),
                  )
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
            let fallbackAssistantTranslation = fallback.translation || '';
            let userTranslationFromBatchFallback: string | undefined =
              undefined;
            try {
              const translationEntries: Array<{
                role: 'user' | 'ai';
                text: string;
              }> = [];
              if (latestUserMessageId && hanzi) {
                translationEntries.push({ role: 'user', text: hanzi });
              }
              if (finalHanziFallback) {
                translationEntries.push({
                  role: 'ai',
                  text: finalHanziFallback,
                });
              }
              if (translationEntries.length > 0) {
                const translations = await (
                  this.openai as any
                ).translateConversationEntries(translationEntries);
                if (translations.ai) {
                  fallbackAssistantTranslation = translations.ai;
                }
                userTranslationFromBatchFallback = translations.user;
              }
            } catch (err) {
              this.logger.warn(
                'Fallback batch translation failed; using single-shot result',
                err as any,
              );
            }

            if (
              latestUserMessageId &&
              typeof userTranslationFromBatchFallback === 'string'
            ) {
              await this.prisma.message.update({
                where: { id: latestUserMessageId },
                data: { translation: userTranslationFromBatchFallback },
              });
              const userUpdatePayload = JSON.stringify({
                id: latestUserMessageId,
                segments: latestUserSegments ?? undefined,
                pinyin: latestUserPinyin,
                translation: userTranslationFromBatchFallback,
              });
              subscriber.next({
                data: JSON.stringify({
                  type: 'user-update',
                  data: userUpdatePayload,
                }),
              });
              subscriber.next({
                event: 'user-update',
                data: userUpdatePayload,
              });
            }

            const aiMsg = await this.prisma.message.create({
              data: {
                conversationId,
                role: 'ai',
                hanzi: finalHanziFallback,
                pinyin: pinyinPerChar || '',
                translation: fallbackAssistantTranslation,
              },
            });

            subscriber.next({
              data: JSON.stringify({
                type: 'ai-enrichment',
                conversationId,
                pinyin: pinyinPerChar,
                segments: segments2,
              }),
            });

            subscriber.next({
              data: JSON.stringify({
                type: 'ai-translation',
                conversationId,
                translation: fallbackAssistantTranslation,
              }),
            });

            // Emit ai-audio when TTS completes
            const audioPromise2 = this.generateAndSaveAudio(
              finalHanziFallback,
              conversationId,
              aiMsg.id,
              userId,
            )
              .then((audioUrl) => {
                subscriber.next({
                  data: JSON.stringify({
                    type: 'ai-audio',
                    conversationId,
                    audioUrl,
                  }),
                });
              })
              .catch((err) => {
                this.logger.warn('TTS synthesis failed (fallback)', err as any);
              });

            // Notes generation is now manual-only via the generate-notes endpoint
            // Removed automatic note generation to enforce quota

            // Wait for audio generation, then emit final
            await Promise.all([audioPromise2]);
            subscriber.next({
              data: JSON.stringify({
                type: 'final',
                conversationId,
                complete: true,
              }),
            });
            subscriber.complete();
          } catch (inner) {
            this.logger.error(
              'SSE fallback failed; emitting error message',
              (inner as any)?.stack || (inner as any) || 'unknown error',
            );
            // Emit error event so client can react
            try {
              subscriber.next({
                event: 'error',
                data: { message: (inner as any)?.message || 'fallback failed' },
              });
            } catch {
              this.logger.debug(
                'Failed to emit SSE fallback error event; client may have disconnected',
              );
            }
            // Final fallback: emit an error message entry so UI clears placeholder
            const aiMsg = await this.prisma.message.create({
              data: {
                conversationId,
                role: 'ai',
                hanzi: '（抱歉）目前无法生成回复，请稍后再试。',
                pinyin:
                  '（bàoqiàn） mùqián wúfǎ shēngchéng huífú， qǐng shāohòu zàishì。',
                translation:
                  'Sorry, I could not generate a reply right now. Please try again later.',
              },
            });
            const errPayload = JSON.stringify(aiMsg);
            subscriber.next({
              data: JSON.stringify({ type: 'final', data: errPayload }),
            });
            subscriber.next({ event: 'final', data: errPayload });
            subscriber.complete();
          }
        }
      })().catch((err) => {
        // Outer guard to ensure subscriber is completed and error is visible
        try {
          this.logger.error(
            'streamReply unhandled failure',
            (err as any)?.stack || (err as any) || 'unknown error',
          );
        } catch {
          this.logger.debug(
            'Failed to log unhandled SSE failure (logger error)',
          );
        }
        try {
          subscriber.next({
            event: 'error',
            data: { message: (err as any)?.message || 'stream crashed' },
          });
        } catch {
          this.logger.debug(
            'Failed to emit outer SSE error event; client may have disconnected',
          );
        }
        try {
          subscriber.complete();
        } catch {
          this.logger.debug(
            'Failed to complete SSE stream; client may have disconnected',
          );
        }
      });
    });
  }

  private isChineseChar(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df)
    );
  }

  private async computeSentencePinyinPerCharacter(
    text: string,
  ): Promise<string> {
    const segments = await this.segmentationService.segmentText(text);
    const chars = Array.from(text);
    const perChar: string[] = new Array(chars.length).fill('');
    // Pointer to next chinese char index in sentence
    let ci = 0;
    // Helper: advance ci to next Chinese
    const advanceToNextChinese = () => {
      while (ci < chars.length && !this.isChineseChar(chars[ci])) ci++;
    };
    advanceToNextChinese();
    for (const seg of segments) {
      if (!seg.isWord || !seg.pinyin) {
        // skip non-words; just advance ci by number of Chinese chars in seg
        const chineseLen = Array.from(seg.word).filter((c) =>
          this.isChineseChar(c),
        ).length;
        for (let k = 0; k < chineseLen; k++) {
          if (ci >= chars.length) break;
          advanceToNextChinese();
          ci++;
        }
        continue;
      }
      const tokenSyllables = seg.pinyin
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((s) => toToneMarks(s) || '');
      const chineseLen = Array.from(seg.word).filter((c) =>
        this.isChineseChar(c),
      ).length;
      for (let k = 0; k < chineseLen; k++) {
        advanceToNextChinese();
        if (ci >= chars.length) break;
        perChar[ci] = tokenSyllables[k] || tokenSyllables[0] || '';
        ci++;
      }
    }
    return perChar.join(' ');
  }

  private async computeSentencePinyinArray(text: string): Promise<string[]> {
    const joined = await this.computeSentencePinyinPerCharacter(text);
    return joined.split(/\s+/);
  }

  private async enrichTextWithSegments(text?: string, pinyin?: string) {
    if (!text || !Array.from(text).some((c) => this.isChineseChar(c)))
      return undefined;
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

  private async generateAndSaveAudio(
    finalHanzi: string,
    conversationId: number,
    messageId: number,
    userId?: number,
  ): Promise<string> {
    const { audioBuffer, fileExtension } = await (
      this.openai as any
    ).synthesizeSpeech(finalHanzi);
    const fs = await import('fs');
    const path = await import('path');
    const baseDir = path.resolve(process.cwd(), 'uploads', 'audio');
    await fs.promises.mkdir(baseDir, { recursive: true });
    const fileName = `conv-${conversationId}-msg-${messageId}-${Date.now()}.${fileExtension}`;
    const filePath = path.join(baseDir, fileName);
    await fs.promises.writeFile(filePath, audioBuffer);
    const publicUrl = `/media/audio/${fileName}`;

    // Update the message with audio URL
    await this.prisma.message.update({
      where: { id: messageId },
      data: { audioUrl: publicUrl },
    });

    // Calculate actual audio duration from the generated audio buffer
    const audioDurationSeconds = await this.calculateAudioDuration(
      audioBuffer,
      `audio/${fileExtension}`,
    );
    // Meter TTS usage using actual audio duration
    if (userId) {
      try {
        const resource = BILLING_RESOURCES.CONVO_TTS_SECONDS;
        const limit = await this.billingPlanService.getLimit(userId, resource);
        if (limit && limit.monthlyCap > 0) {
          await this.usageService.recordUsage({
            userId,
            resource,
            amount: audioDurationSeconds,
            idempotencyKey: `tts:${messageId}`,
            metadata: {
              conversationId,
              messageId,
              type: 'tts_output',
              durationSeconds: audioDurationSeconds,
            },
          });
        }
      } catch (error) {
        this.logger.warn(
          'Failed to record TTS audio usage (output metering)',
          error as Error,
        );
      }
    }

    return publicUrl;
  }

  async generateEnrichedNotes(
    userId: number,
    finalHanzi: string,
    userHanzi: string,
    conversationId: number,
    messageId: number,
  ): Promise<any> {
    const ctx = await this.rag.retrieveForConversation(
      userId,
      finalHanzi,
      userHanzi,
    );
    const profile = await this.rag.getUserProfile(userId);
    const notes = await (this.openai as any).generateGrammarNotes(finalHanzi, {
      level: profile.level,
      strugglingWords: profile.strugglingWords,
      contextText: ctx?.contextText,
    });
    // Enrich tutor notes with segmentation for clickable pinyin-above-hanzi in UI
    const enrichedNotes = await this.enrichNotesWithSegments(notes as any);
    // Also enrich tips into tipsRich with segments
    if (Array.isArray((enrichedNotes as any).tips)) {
      const tipsRich = [] as Array<{
        zh: string;
        en?: string;
        segments?: any[];
      }>;
      for (const t of (enrichedNotes as any).tips) {
        if (t && typeof t.zh === 'string') {
          const segs = await this.enrichTextWithSegments(t.zh);
          tipsRich.push({ zh: t.zh, en: t.en, segments: segs });
        }
      }
      (enrichedNotes as any).tipsRich = tipsRich;
    }

    // Update the message with notes
    await this.prisma.message.update({
      where: { id: messageId },
      data: { notes: enrichedNotes as any },
    });

    return enrichedNotes;
  }

  private extractTextFromResponseOutput(output: any): string {
    if (!Array.isArray(output)) return '';
    const chunks: string[] = [];
    for (const item of output) {
      if (item?.type === 'message' && Array.isArray(item?.content)) {
        for (const contentItem of item.content) {
          if (
            contentItem?.type === 'output_text' &&
            typeof contentItem.text === 'string'
          ) {
            chunks.push(contentItem.text);
          }
        }
      } else if (
        item?.type === 'output_text' &&
        typeof item?.text === 'string'
      ) {
        chunks.push(item.text);
      }
    }
    return chunks.join('');
  }
}
