import { Injectable, Logger } from '@nestjs/common';
import { toToneMarks } from '../utils/pinyin';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../openai/openai.service';
import { Observable } from 'rxjs';
import { SegmentationService } from '../vocabulary/segmentation.service';
import { RagService } from '../rag/rag.service';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAIService,
    private readonly segmentationService: SegmentationService,
    private readonly rag: RagService,
  ) {
    void prisma;
    void openai;
    void segmentationService;
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
    // Transcribe audio to text (Mandarin)
    const hanzi = await (this.openai as any).transcribeAudio(
      audioBuffer,
      mimeType,
    );
    const userMsg = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        hanzi,
        pinyin: '',
        translation: '',
      },
    });
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
          const model = 'gpt-4o-mini';
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
          const stream = await client.chat.completions.create({
            model,
            stream: true,
            messages: [
              {
                role: 'system',
                content:
                  'You are a native Mandarin tutor. While streaming, output ONLY Simplified Chinese characters (no JSON, pinyin, or translation). If the user uses Traditional characters, convert to Simplified in your reply. Keep it concise. After streaming ends, we will run a separate non-stream call to obtain JSON with hanzi, pinyin, and translation for persistence.',
              },
              ...history,
            ],
          } as any);

          let fullText = '';
          for await (const part of stream as any) {
            let delta = part?.choices?.[0]?.delta?.content as
              | string
              | undefined;
            if (!delta) continue;
            // If the model accidentally emits JSON, extract text
            if (delta.trim().startsWith('{')) {
              try {
                const maybe = JSON.parse(delta);
                if (typeof maybe?.hanziDelta === 'string') {
                  delta = maybe.hanziDelta;
                } else if (typeof maybe?.hanzi === 'string') {
                  delta = maybe.hanzi;
                }
              } catch {
                // ignore
              }
            }
            fullText += delta;
            subscriber.next({ data: JSON.stringify({ hanziDelta: delta }) });
          }

          // User message enrichment (pinyin/translation + segments)
          // Ensure this emits before we send 'final' so the client doesn't miss it
          try {
            const text = hanzi;
            const hasChinese = Array.from(text).some((ch) =>
              this.isChineseChar(ch as any),
            );
            if (hasChinese) {
              const analyzed = await (
                this.openai as any
              ).analyzeChineseSentence(text);
              const segs = await this.segmentationService.segmentText(text);
              // Build char-level pinyin array from analyzed pinyin for fallback filling
              const charPinyinArray = (analyzed.pinyin || '')
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
                    pinyin: toToneMarks(analyzed.pinyin) || '',
                    translation: analyzed.translation || '',
                  },
                });
                // Emit a user-update event so frontend can show toggles immediately
                const userUpdatePayload = JSON.stringify({
                  id: latestUser.id,
                  segments,
                  pinyin: toToneMarks(analyzed.pinyin) || '',
                  translation: analyzed.translation || '',
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

          // After stream ends, get final structured fields using our non-stream api with context
          const ai = await (this.openai as any).chatChineseReplyWithContext(
            history.concat({ role: 'assistant', content: fullText }).concat({
              role: 'user',
              content:
                'Convert the previous assistant message into STRICT JSON with keys hanzi, pinyin, translation.\nRules:\n- hanzi MUST be EXACTLY the assistant Chinese text above (no paraphrase, no extra text).\n- pinyin MUST be pinyin for that hanzi (tone marks or numbers are fine).\n- translation MUST be natural English, with no Chinese characters.\nReturn JSON only.',
            }),
          );
          // Compute per-character pinyin using segmentation for accurate alignment
          const finalHanzi = ai.hanzi || fullText;
          const pinyinPerChar =
            await this.computeSentencePinyinPerCharacter(finalHanzi);
          // Build per-character array aligned to hanzi for segment pinyin filling
          const charPinyinArray =
            await this.computeSentencePinyinArray(finalHanzi);
          let aiMsg = await this.prisma.message.create({
            data: {
              conversationId,
              role: 'ai',
              hanzi: finalHanzi,
              pinyin: pinyinPerChar || '',
              translation: ai.translation || '',
            },
          });
          // Generate grounded grammar notes if enabled
          try {
            const ctx = await this.rag.retrieveForConversation(
              userId,
              finalHanzi,
              hanzi,
            );
            const profile = await this.rag.getUserProfile(userId);
            const notes = await (this.openai as any).generateGrammarNotes(
              finalHanzi,
              {
                level: profile.level,
                strugglingWords: profile.strugglingWords,
                contextText: ctx?.contextText,
              },
            );
            // Enrich tutor notes with segmentation for clickable pinyin-above-hanzi in UI
            const enrichedNotes = await this.enrichNotesWithSegments(
              notes as any,
            );
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
            aiMsg = await this.prisma.message.update({
              where: { id: aiMsg.id },
              data: { notes: enrichedNotes as any },
            });
          } catch (err) {
            this.logger.warn('Grammar notes generation skipped', err as any);
          }
          // Attach segments so the frontend can show popups like in lessons
          // Enrich segmentation with model-annotated vocabulary to capture multi-word phrases
          let vocabExtras: Array<{
            text: string;
            pinyin?: string;
            definition?: string;
            hskLevel?: number;
          }> = [];
          try {
            vocabExtras = await (this.openai as any).annotateChinese(
              ai.hanzi || fullText,
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
              const hann = (ai.hanzi || fullText) as string;
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
          // Generate TTS audio and persist file, then update message.audioUrl
          try {
            const { audioBuffer, fileExtension } = await (
              this.openai as any
            ).synthesizeSpeech(finalHanzi);
            const fs = await import('fs');
            const path = await import('path');
            const baseDir = path.resolve(process.cwd(), 'uploads', 'audio');
            await fs.promises.mkdir(baseDir, { recursive: true });
            const fileName = `conv-${conversationId}-msg-${aiMsg.id}-${Date.now()}.${fileExtension}`;
            const filePath = path.join(baseDir, fileName);
            await fs.promises.writeFile(filePath, audioBuffer);
            const publicUrl = `/media/audio/${fileName}`;
            aiMsg = await this.prisma.message.update({
              where: { id: aiMsg.id },
              data: { audioUrl: publicUrl },
            });
          } catch (err) {
            this.logger.warn('TTS synthesis failed (stream final)', err as any);
          }
          const payloadData = JSON.stringify({ ...aiMsg, segments });
          // Default event for clients listening onmessage
          subscriber.next({
            data: JSON.stringify({ type: 'final', data: payloadData }),
          });
          // Named event for clients listening to 'final'
          subscriber.next({ event: 'final', data: payloadData });
          subscriber.complete();
        } catch (e) {
          this.logger.error(
            'SSE streaming failed; attempting fallback',
            e as any,
          );
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
            let aiMsg = await this.prisma.message.create({
              data: {
                conversationId,
                role: 'ai',
                hanzi: finalHanziFallback,
                pinyin: pinyinPerChar || '',
                translation: fallback.translation || '',
              },
            });
            // Attempt TTS so audioUrl is included in final payload as well
            try {
              const { audioBuffer, fileExtension } = await (
                this.openai as any
              ).synthesizeSpeech(finalHanziFallback);
              const fs = await import('fs');
              const path = await import('path');
              const baseDir = path.resolve(process.cwd(), 'uploads', 'audio');
              await fs.promises.mkdir(baseDir, { recursive: true });
              const fileName = `conv-${conversationId}-msg-${aiMsg.id}-${Date.now()}.${fileExtension}`;
              const filePath = path.join(baseDir, fileName);
              await fs.promises.writeFile(filePath, audioBuffer);
              const publicUrl = `/media/audio/${fileName}`;
              aiMsg = await this.prisma.message.update({
                where: { id: aiMsg.id },
                data: { audioUrl: publicUrl },
              });
            } catch (err) {
              this.logger.warn('TTS synthesis failed (fallback)', err as any);
            }
            // Grounded notes (fallback path)
            try {
              const ctx2 = await this.rag.retrieveForConversation(
                userId,
                finalHanziFallback,
                hanzi,
              );
              const profile2 = await this.rag.getUserProfile(userId);
              const notes2 = await (this.openai as any).generateGrammarNotes(
                finalHanziFallback,
                {
                  level: profile2.level,
                  strugglingWords: profile2.strugglingWords,
                  contextText: ctx2?.contextText,
                },
              );
              aiMsg = await this.prisma.message.update({
                where: { id: aiMsg.id },
                data: { notes: notes2 as any },
              });
            } catch (err) {
              this.logger.warn('Grammar notes generation skipped', err as any);
            }
            const payloadData2 = JSON.stringify({
              ...aiMsg,
              segments: segments2,
            });
            subscriber.next({
              data: JSON.stringify({ type: 'final', data: payloadData2 }),
            });
            subscriber.next({ event: 'final', data: payloadData2 });
            subscriber.complete();
          } catch (inner) {
            this.logger.error(
              'SSE fallback failed; emitting error message',
              inner as any,
            );
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
      })();
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

  private toToneMarkSyllable(syl: string): string {
    // Normalize alternate representations of ü before parsing tones
    const normalized = (syl || '').replace(/u:/gi, 'ü').replace(/v/gi, 'ü');
    const m = normalized.match(
      /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw]?)([aeiouüv]+[a-z]*)([1-5])?$/i,
    );
    if (!m) return normalized.toLowerCase();
    const head = (m[1] || '').toLowerCase();
    let body = (m[2] || '').toLowerCase();
    const tone = parseInt(m[3] || '0', 10);
    body = body.replace('v', 'ü').replace('u:', 'ü');
    if (!tone || tone === 5) return head + body;
    const toneMap: Record<string, string[]> = {
      a: ['ā', 'á', 'ǎ', 'à'],
      e: ['ē', 'é', 'ě', 'è'],
      i: ['ī', 'í', 'ǐ', 'ì'],
      o: ['ō', 'ó', 'ǒ', 'ò'],
      u: ['ū', 'ú', 'ǔ', 'ù'],
      ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
    };
    let idx = -1;
    if (body.includes('a')) idx = body.indexOf('a');
    else if (body.includes('e')) idx = body.indexOf('e');
    else if (body.includes('ou')) idx = body.indexOf('o');
    else {
      for (const v of ['i', 'o', 'u', 'ü']) {
        const pos = body.indexOf(v);
        if (pos >= 0) {
          idx = pos;
          break;
        }
      }
    }
    if (idx >= 0) {
      const v = body[idx];
      const marked = (toneMap as any)[v]?.[tone - 1];
      if (marked) body = body.slice(0, idx) + marked + body.slice(idx + 1);
    }
    return head + body;
  }
  private toToneMarks(line?: string): string | undefined {
    if (!line) return undefined;
    return line
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => this.toToneMarkSyllable(s))
      .join(' ');
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
        .map((s) => this.toToneMarkSyllable(s));
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
      const segPinyinTone = this.toToneMarks(segPinyin);
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
