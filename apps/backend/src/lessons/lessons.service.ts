/* eslint-disable no-unused-vars */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../openai/openai.service';
import { SegmentationService } from '../vocabulary/segmentation.service';
import { RagService } from '../rag/rag.service';

interface GenerateOptions {
  level?: number;
  type?: 'story' | 'dialogue';
  readTimeMinutes?: number;
  topic?: string;
}

@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly openAIService: OpenAIService,
    private readonly segmentationService: SegmentationService,
    private readonly ragService: RagService,
  ) {}

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
      const vocabExtras = Array.isArray(generated.vocabulary)
        ? generated.vocabulary.map((w: any) => ({
            text: w.hanzi || w.word || w.text,
            pinyin: w.pinyin,
            definition: w.translation || w.definition,
            hskLevel: w.hskLevel,
          }))
        : [];
      const turns = Array.isArray(generated.dialogue?.turns)
        ? generated.dialogue.turns
        : [];

      const turnsWithSegments = [] as any[];
      for (const t of turns) {
        let segs: any[] = [];
        try {
          segs = await this.segmentationService.segmentText(
            t.hanzi || '',
            vocabExtras,
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
          pinyin: this.toToneMarks(s.pinyin),
        }));

        turnsWithSegments.push({
          speaker: t.speaker,
          hanzi: t.hanzi || '',
          pinyin: this.toToneMarks(t.pinyin || ''),
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
      } catch {
        // best-effort, ignore
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
                  titlePinyin:
                    this.toToneMarks(generated.titlePinyin || '') || null,
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
      const wordsExtra = Array.isArray(generated.vocabulary)
        ? generated.vocabulary.map((w: any) => ({
            text: w.hanzi || w.word || w.text,
            pinyin: w.pinyin,
            definition: w.translation || w.definition,
            hskLevel: w.hskLevel,
          }))
        : [];
      const segs = await this.segmentationService.segmentText(
        mainText,
        wordsExtra,
      );

      // Fill missing pinyin from story.pinyin (fallback per character)
      const filledSegsRaw = this.fillSegmentPinyinFromLine(
        generated.story?.hanzi || '',
        generated.story?.pinyin || '',
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
        pinyin: this.toToneMarks(s.pinyin),
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
                  titlePinyin:
                    this.toToneMarks(generated.titlePinyin || '') || null,
                  titleTranslation: generated.titleTranslation || null,
                  hanzi: generated.story?.hanzi || '',
                  pinyin: this.toToneMarks(generated.story?.pinyin || ''),
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

  async getLessonById(id: number) {
    return this.prismaService.lesson.findUniqueOrThrow({
      where: { id },
      include: { sections: { orderBy: { id: 'asc' } } },
    });
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
        content:
          'You are a native Mandarin speaker and a senior Mandarin curriculum and lesson designer with much creativity in creating engaging lessons types and topics. Generate long, engaging lessons strictly as JSON. Do not include any extra commentary.',
      },
      {
        role: 'user' as const,
        content: `Generate a Mandarin Chinese story lesson tailored to HSK level ${level}. Tell a coherent, engaging story strictly about the TOPIC. Length target: ~${approxChars} characters. Provide rich content. Use HSK-${level} vocab and grammar, with a few stretch words.${topicLine}

Return ONLY valid JSON with EXACTLY these keys (no extra keys, no comments):
{
  "title": "string || null",
  "titlePinyin": "string || null",
  "titleTranslation": "string || null",
    lines)",
  "lessonType": "story",
  "level": ${level},
  "story": {
    "hanzi": "string (full Chinese text)",
    "pinyin": "string (full text pinyin, line aligned if possible; keep paragraph breaks)",
    "translation": "string (full English translation; mirror paragraph breaks with blank 
    lines)"
  },
  "vocabulary": [
    { "hanzi": "string", "pinyin": "string", "translation": "string", "hskLevel": ${level} }
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
        content:
          'You are a native Mandarin speaker and an expert lesson designer. Return STRICT JSON only.',
      },
      {
        role: 'user' as const,
        content: `Generate a Mandarin Chinese dialogue lesson tailored to HSK level ${level}. Provide ${approxTurns} turns of natural conversation. Use HSK-${level} vocab and grammar, with a few stretch words.${topicLine}

Return ONLY valid JSON with EXACTLY these keys (no extra keys, no comments):
{
  "title": "string | null",
  "titlePinyin": "string | null",
  "titleTranslation": "string | null",
  "lessonType": "dialogue",
  "level": ${level},
  "dialogue": {
    "turns": [ // 18-22 turns of practical daily conversation suitable for HSK-${level}
      { "speaker": ""<Character name 1>|<Character name 2>|<Narrator or Third person (such as waiter(in restaurant setting), etc.)>"", "hanzi": "string", "pinyin": "string <USING tone marks NOT numeric tones>", "translation": "string" }
    ]
  },
  "vocabulary": [
    { "hanzi": "string", "pinyin": "string", "translation": "string", "hskLevel": ${level} }
  ]
}
  - The title MUST include a keyword from the TOPIC (if provided).
  - Use topic-specific vocabulary and include it in the vocabulary list.
  - Keep JSON concise but content-rich. No markdown, no commentary, JSON only.`,
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

  // Convert numeric tones to tone marks (e.g., ni3hao3 -> nǐ hǎo)
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
