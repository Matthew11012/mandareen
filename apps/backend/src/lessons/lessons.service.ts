import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../openai/openai.service';
import { SegmentationService } from '../vocabulary/segmentation.service';

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
  ) {}

  async generateAndStoreLesson(
    user: { id: number; email: string },
    options: GenerateOptions,
  ): Promise<{ id: number }> {
    const level = options.level ?? (await this.resolveUserLevel(user.id));
    const type = options.type ?? 'story';
    const readTimeMinutes = options.readTimeMinutes ?? 10;
    const topic = options.topic?.trim();

    const generated = await this.openaiGenerateLesson({
      level,
      type,
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
        const segs = await this.segmentationService.segmentText(
          t.hanzi || '',
          vocabExtras,
        );

        // Fill missing pinyin from the dialogue turn pinyin line (fallback per character)
        const filledSegs = this.fillSegmentPinyinFromLine(
          t.hanzi || '',
          t.pinyin || '',
          segs.map((s) => ({
            text: s.word,
            startIndex: s.startIndex,
            endIndex: s.endIndex,
            isWord: s.isWord,
            hskLevel: s.hskLevel,
            pinyin: s.pinyin,
            definition: s.definition,
          })),
        );

        turnsWithSegments.push({
          speaker: t.speaker,
          hanzi: t.hanzi || '',
          pinyin: t.pinyin || '',
          translation: t.translation || '',
          segments: filledSegs,
        });
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
                  titlePinyin: generated.titlePinyin || null,
                  titleTranslation: generated.titleTranslation || null,
                  turns: turnsWithSegments,
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
      const filledSegs = this.fillSegmentPinyinFromLine(
        generated.story?.hanzi || '',
        generated.story?.pinyin || '',
        segs.map((s) => ({
          text: s.word,
          startIndex: s.startIndex,
          endIndex: s.endIndex,
          isWord: s.isWord,
          hskLevel: s.hskLevel,
          pinyin: s.pinyin,
          definition: s.definition,
        })),
      );

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
                  titlePinyin: generated.titlePinyin || null,
                  titleTranslation: generated.titleTranslation || null,
                  hanzi: generated.story?.hanzi || '',
                  pinyin: generated.story?.pinyin || '',
                  translation: generated.story?.translation || '',
                  segments: filledSegs,
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

  async listLessons(level?: number) {
    const lessons = await this.prismaService.lesson.findMany({
      where: level ? { level } : undefined,
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

  private async openaiGenerateLesson({
    level,
    type,
    readTimeMinutes,
    topic,
  }: {
    level: number;
    type: 'story' | 'dialogue';
    readTimeMinutes: number;
    topic?: string;
  }) {
    const preferredModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const client = (this.openAIService as any)
      .openai as import('openai').default;

    type ChatMessage = { role: 'system' | 'user'; content: string };
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a senior Mandarin curriculum designer. Generate long, engaging lessons strictly as JSON. Do not include any extra commentary.',
      },
      {
        role: 'user',
        content: this.buildLessonPrompt(level, type, readTimeMinutes, topic),
      },
    ];

    const completion = await client.chat.completions.create({
      model: preferredModel,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.85,
      presence_penalty: 0.6,
      frequency_penalty: 0.2,
    } as any);

    const content = completion.choices[0].message.content;
    if (!content) throw new Error('Empty OpenAI response');
    const data = JSON.parse(content);
    return data;
  }

  private buildLessonPrompt(
    level: number,
    type: 'story' | 'dialogue',
    readTimeMinutes: number,
    topic?: string,
  ): string {
    const approxChars = Math.min(readTimeMinutes * 300, 6000);
    const topicLine = topic
      ? `\nTOPIC (mandatory): ${topic}\nYou MUST center the entire ${type} on this topic. The title MUST include at least one keyword from the topic. Use domain-specific vocabulary related to the topic throughout the text and include those items in the vocabulary list.`
      : `\nNo topic provided: choose a fresh everyday-life theme distinct from generic themes. Avoid those unless explicitly requested.`;
    const genreHint =
      type === 'dialogue'
        ? 'Use realistic, practical daily-life conversation turns strictly about the TOPIC. Each turn should naturally advance a situation revolving around the TOPIC.'
        : 'Tell a coherent, engaging story strictly about the TOPIC: develop scenes and actions that focus on the TOPIC.';

    return `
Generate a Mandarin Chinese ${type} lesson tailored to HSK level ${level}. ${genreHint} Length target: approximately ${readTimeMinutes} minutes read (~${approxChars} characters). Provide rich content (avoid being short). Use HSK-${level} vocab and grammar, with a few stretch words.${topicLine}

Return ONLY valid JSON with this exact structure (no extra keys, no comments):
{
  "title": "string | null",
  "titlePinyin": "string | null",
  "titleTranslation": "string | null",
  "lessonType": "${type}",
  "level": ${level},
  "story": { // if type is story
    "hanzi": "string (full Chinese text)",
    "pinyin": "string (full text pinyin, line aligned if possible; keep paragraph breaks)",
    "translation": "string (full English translation; mirror paragraph breaks with blank lines)"
  },
  "dialogue": { // if type is dialogue, else null
    "turns": [ // 18-22 turns of practical daily conversation suitable for HSK-${level}
      { "speaker": "A|B|Narrator", "hanzi": "string", "pinyin": "string", "translation": "string" }
    ]
  },
  "vocabulary": [
    { "hanzi": "string", "pinyin": "string", "translation": "string", "hskLevel": ${level} }
  ]
}

Strict requirements:
- If TOPIC is provided, the ${type} MUST revolve around it. Do NOT default to generic themes (moving to a new city, weekend travel, Huangshan) unless explicitly in the TOPIC.
- The title MUST include a keyword from the TOPIC (if provided).
- Use topic-specific vocabulary and include it in the vocabulary list.
- Keep JSON concise but content-rich. No markdown, no commentary, JSON only.`;
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
}
