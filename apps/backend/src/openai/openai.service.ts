import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { Passage } from '../assessment/models/passage.model';
import { v4 as uuidv4 } from 'uuid';

interface OpenAIError extends Error {
  message: string;
}

@Injectable()
export class OpenAIService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAIService.name);

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Create embeddings for texts (used by RAG ingestion or retrieval)
   */
  async embedTexts(texts: string[], model?: string): Promise<number[][]> {
    const embedModel =
      model || process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
    if (!Array.isArray(texts) || texts.length === 0) return [];
    const res = await (this.openai as any).embeddings.create({
      model: embedModel,
      input: texts.slice(0, 100),
    });
    const vectors: number[][] = (res?.data || []).map(
      (d: any) => d.embedding || [],
    );
    return vectors;
  }

  async translateConversationEntries(
    entries: Array<{ role: 'user' | 'ai'; text: string }>,
  ): Promise<{ user?: string; ai?: string }> {
    const model = process.env.OPENAI_MODEL_TRANSLATE || 'gpt-5-nano';
    const userText = entries.find((entry) => entry.role === 'user')?.text ?? '';
    const aiText = entries.find((entry) => entry.role === 'ai')?.text ?? '';
    const renderedEntries = [
      `Entry (role: user): ${userText || '(none provided)'}`,
      `Entry (role: ai): ${aiText || '(none provided)'}`,
    ].join('\n\n');
    const response = await (this.openai as any).responses.create({
      model,
      reasoning: { effort: 'minimal' },
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'You are an English translator for Mandarin sentences. For each entry provided, output ONLY in English, the English translation - never repeat the Chinese characters of the User or AI input. Mirror the sentence order and punctuation in natural English. If the entry is empty or not Chinese, return an empty string for that role. Always return STRICT JSON with keys "user" and "ai". Example response: {"user":<english translation of user entry>,"ai":<english translation of ai entry>}',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: renderedEntries,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'ConversationTurnTranslations',
          schema: {
            type: 'object',
            properties: {
              user: { type: 'string' },
              ai: { type: 'string' },
            },
            required: ['user', 'ai'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = this.extractResponseText(response);
    if (!content) return {};
    try {
      const data = JSON.parse(content);
      const result: { user?: string; ai?: string } = {};
      if (typeof data.user === 'string') result.user = data.user;
      if (typeof data.ai === 'string') result.ai = data.ai;
      return result;
    } catch {
      return {};
    }
  }

  async generateReplySuggestions(opts: {
    conversationHistory: Array<{ role: 'user' | 'ai'; hanzi: string }>;
    targetHskLevel?: string;
  }): Promise<Array<{ zh: string; translation: string }>> {
    const model = process.env.OPENAI_MODEL_CONVERSATION_REPLY || 'gpt-5-nano';

    const history = Array.isArray(opts.conversationHistory)
      ? opts.conversationHistory.slice(-4)
      : [];
    const renderedHistory =
      history.length === 0
        ? '(no prior turns)'
        : history
            .map(
              (m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.hanzi || ''}`,
            )
            .join('\n');

    const hskHint = opts.targetHskLevel
      ? ` Keep difficulty and vocabulary around ${opts.targetHskLevel.toUpperCase()}.`
      : '';

    const response = await (this.openai as any).responses.create({
      model,
      reasoning: { effort: 'minimal' },
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'You are a native Mandarin friend helping the user continue a casual chat. Generate exactly TWO short follow-up suggestions in Simplified Chinese plus an English gloss. Keep each Chinese suggestion concise (about 8–25 characters), natural, friendly, and appropriate natural suggestions to continue according to the level of the user. Do NOT include pinyin, punctuation-only lines, or any extra formatting.' +
                hskHint +
                '\n\nReturn STRICT JSON matching the provided schema.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Recent turns (most recent last):\n${renderedHistory}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'ConversationReplySuggestions',
          schema: {
            type: 'object',
            properties: {
              suggestions: {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                items: {
                  type: 'object',
                  properties: {
                    zh: { type: 'string' },
                    translation: { type: 'string' },
                  },
                  required: ['zh', 'translation'],
                  additionalProperties: false,
                },
              },
            },
            required: ['suggestions'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = this.extractResponseText(response);
    if (!content) return [];
    try {
      const parsed = JSON.parse(content);
      const arr = Array.isArray(parsed?.suggestions)
        ? parsed.suggestions
        : Array.isArray(parsed)
          ? parsed
          : [];
      if (!Array.isArray(arr)) return [];
      return arr
        .map((item) => {
          const zh = typeof item?.zh === 'string' ? item.zh.trim() : '';
          const translation =
            typeof item?.translation === 'string'
              ? item.translation.trim()
              : '';
          if (!zh) return null;
          return { zh, translation };
        })
        .filter(Boolean) as Array<{ zh: string; translation: string }>;
    } catch (err) {
      this.logger.warn('Failed to parse reply suggestions JSON', err as any);
      return [];
    }
  }

  private extractResponseText(resp: any): string {
    if (!resp) return '';
    if (typeof resp.output_text === 'function') {
      try {
        return resp.output_text.join('');
      } catch {
        // fall through to manual extraction
      }
    }
    const output = resp?.output;
    if (!Array.isArray(output)) return '';
    const chunks: string[] = [];
    for (const item of output) {
      if (item?.content && Array.isArray(item.content)) {
        for (const block of item.content) {
          if (
            (block.type === 'output_text' || block.type === 'text') &&
            typeof block.text === 'string'
          ) {
            chunks.push(block.text);
          }
        }
      } else if (
        (item?.type === 'output_text' || item?.type === 'text') &&
        typeof item?.text === 'string'
      ) {
        chunks.push(item.text);
      }
    }
    return chunks.join('');
  }
  /**
   * Transcribe an audio buffer into Mandarin text using OpenAI STT.
   * Accepts common MIME types like audio/webm, audio/mpeg, audio/mp4, audio/wav, audio/ogg, audio/m4a.
   * @param buffer - Audio buffer to transcribe
   * @param mimeType - MIME type of the audio file
   * @param contextPrompt - Optional conversation context to improve transcription accuracy (last 2-4 messages)
   */
  async transcribeAudio(
    buffer: Buffer,
    mimeType: string,
    contextPrompt?: string,
  ): Promise<string> {
    const model = process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe';
    // Persist to a temp file to ensure compatibility with OpenAI SDK file upload
    const ext = this.mimeToExtension(mimeType) || 'webm';
    const tempDir = path.resolve(process.cwd(), 'uploads', 'tmp');
    await fs.promises.mkdir(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `stt-${Date.now()}.${ext}`);
    await fs.promises.writeFile(tempFile, buffer);
    try {
      const fileStream = fs.createReadStream(tempFile);
      // Base prompt for Simplified Chinese output
      const basePrompt =
        '请使用简体中文（简体字）进行转写，不要使用繁体字。若听到中文请一律以简体字输出。';
      // Combine base prompt with conversation context if provided
      const fullPrompt = contextPrompt
        ? `${basePrompt}\n\n对话上下文：\n${contextPrompt}`
        : basePrompt;
      const result = await this.openai.audio.transcriptions.create({
        file: fileStream as any,
        model,
        // Hint the target language and bias model to Simplified Chinese output
        language: 'zh',
        prompt: fullPrompt,
      } as any);
      let text = ((result as any)?.text || '').trim();
      // Deterministic normalization: Traditional -> Simplified using opencc-js
      try {
        const ocjs = await import('opencc-js');
        const converter =
          typeof (ocjs as any).Converter === 'function'
            ? (ocjs as any).Converter({ from: 't', to: 'cn' })
            : null;
        if (converter) {
          text = (converter(text) || '').trim();
        }
      } catch {
        // If opencc-js is not available, keep the original (already biased via prompt)
      }
      return text;
    } finally {
      // Clean up temp file
      fs.promises.unlink(tempFile).catch(() => undefined);
    }
  }

  /**
   * Synthesize Mandarin speech (TTS) from text. Returns audio Buffer and content type.
   */
  async synthesizeSpeech(
    text: string,
    voice?: string,
  ): Promise<{
    audioBuffer: Buffer;
    contentType: string;
    fileExtension: string;
  }> {
    const model = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
    const chosenVoice = voice || process.env.OPENAI_TTS_VOICE || 'alloy';
    const format = (process.env.OPENAI_TTS_FORMAT || 'mp3').toLowerCase();
    const resp = await (this.openai as any).audio.speech.create({
      model,
      voice: chosenVoice,
      input: text,
      format,
    } as any);
    // The SDK returns a web-like Response
    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = this.extensionToContentType(format) || 'audio/mpeg';
    return { audioBuffer: buffer, contentType, fileExtension: format };
  }

  private mimeToExtension(mime: string): string | undefined {
    const map: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/mp4': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
    };
    return map[mime]?.toLowerCase();
  }

  private extensionToContentType(ext: string): string | undefined {
    const map: Record<string, string> = {
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      wav: 'audio/wav',
      webm: 'audio/webm',
      ogg: 'audio/ogg',
      opus: 'audio/ogg',
    };
    return map[ext.toLowerCase()];
  }
  async chatChineseReplyWithContext(
    messagesIn: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>,
  ): Promise<{ hanzi: string; pinyin: string; translation: string }> {
    const model = 'gpt-4o-mini';
    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a friendly native Mandarin tutor. Reply in Chinese first, then provide pinyin and English translation. Format STRICTLY as JSON with keys hanzi, pinyin, translation. Keep replies 1-2 sentences of natural daily conversation.',
        },
        ...messagesIn,
      ],
      response_format: { type: 'json_object' },
    } as any);
    const content = completion.choices[0].message.content;
    if (!content) throw new Error('Empty OpenAI response');
    const data = JSON.parse(content);
    return {
      hanzi: data.hanzi || '',
      pinyin: (data.pinyin || '').toLowerCase(),
      translation: data.translation || '',
    };
  }
  async chatChineseReply(userHanzi: string): Promise<{
    hanzi: string;
    pinyin: string;
    translation: string;
  }> {
    const model = 'gpt-5-nano';
    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a friendly native Mandarin tutor. Reply in Chinese first, then provide pinyin and English translation. Format STRICTLY as JSON with keys hanzi, pinyin, translation. Keep replies 1-2 sentences of natural daily conversation.',
        },
        {
          role: 'user',
          content: `User said: ${userHanzi}. Respond appropriately. Return JSON only.`,
        },
      ],
      response_format: { type: 'json_object' },
    });
    const content = completion.choices[0].message.content;
    if (!content) throw new Error('Empty OpenAI response');
    const data = JSON.parse(content);
    return {
      hanzi: data.hanzi || '',
      pinyin: (data.pinyin || '').toLowerCase(),
      translation: data.translation || '',
    };
  }

  async generateAssessmentPassage(hskLevel: number): Promise<Passage> {
    try {
      const prompt = this.createPassagePrompt(hskLevel);

      const preferredModel = process.env.OPENAI_MODEL || 'gpt-5-mini';
      const fallbackModels = ['gpt-4o-mini'];
      const modelsToTry = [preferredModel, ...fallbackModels];

      let lastError: any = null;
      for (const model of modelsToTry) {
        try {
          const completion = await this.openai.chat.completions.create({
            model,
            messages: [
              {
                role: 'system',
                content:
                  'You are a Mandarin Chinese language expert specializing in creating educational content for language learners at different HSK levels.',
              },
              { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
          });

          const responseContent = completion.choices[0].message.content;
          if (!responseContent) {
            throw new Error('Empty response from OpenAI');
          }

          const passageData = JSON.parse(responseContent);

          return {
            id: uuidv4(),
            ...passageData,
            targetHskLevel: hskLevel,
          };
        } catch (err: any) {
          lastError = err;
          const msg = (err?.message || '').toString();
          const code = (err?.code || '').toString();
          // Retry if model not found; otherwise break
          if (
            msg.includes('model') &&
            (msg.includes('does not exist') ||
              msg.includes('not found') ||
              code === 'model_not_found')
          ) {
            this.logger.warn(
              `Model ${model} unavailable. Trying next fallback...`,
            );
            continue;
          }
          // Non-retryable error
          throw err;
        }
      }

      // Exhausted all models
      throw (
        lastError ||
        new Error('Failed to generate passage: no models available')
      );
    } catch (error) {
      const openaiError = error as OpenAIError;
      this.logger.error(
        `Error generating passage for HSK level ${hskLevel}:`,
        openaiError,
      );
      throw new Error(
        `Failed to generate passage: ${openaiError.message}. You can set OPENAI_MODEL to a supported model (e.g., gpt-4o-mini, gpt-4o, gpt-3.5-turbo).`,
      );
    }
  }

  private createPassagePrompt(hskLevel: number): string {
    return `
    Create a passage in Mandarin Chinese appropriate for HSK level ${hskLevel} students. 
    
    The passage should:
    1. Be 100-150 characters long for levels 1-2, 150-250 for levels 3-4, and 250-400 for levels 5+
    2. Use vocabulary and grammar patterns appropriate for HSK level ${hskLevel}
    3. Include a mix of common and slightly challenging words for this level
    4. Be engaging and culturally relevant
    
    Please format your response as a JSON object with the following structure:
    {
      "title": "Title in Chinese",
      "content": "The full passage in Chinese characters",
      "translation": "English translation of the passage"
    }
    
    For levels 1-3, include some words from the next HSK level to challenge students.
    For levels 4+, include a few advanced words that might be unfamiliar.
    `;
  }

  /**
   * Generate concise grammar notes grounded by provided context.
   * Returns JSON with grammarNotes[], tips[], citations[].
   * Note: We instruct the model to include pinyin/English directly to avoid extra API calls.
   */
  // Back-compat signature: generateGrammarNotes(hanzi, { level, strugglingWords, contextText })
  async generateGrammarNotes(
    hanziOrArgs:
      | string
      | {
          topic: string;
          level?: number;
          context?: string;
          readPassage?: {
            hanzi?: string;
            pinyin?: string;
            translation?: string;
          };
          maxPoints?: number;
          includeDrills?: boolean;
          themes?: string[];
        },
    legacyOpts?: {
      level?: number;
      strugglingWords?: string[];
      contextText?: string;
    },
  ): Promise<{
    grammarNotes?: Array<{
      point: string;
      brief: string;
      examples?: Array<{ zh: string; en?: string }>;
      sources?: Array<{ key?: string; chunkId?: number }>;
      pointPinyin?: string;
      pointEn?: string;
      briefPinyin?: string;
      briefEn?: string;
      examplesPinyin?: Array<{ zh: string; pinyin?: string; en?: string }>;
    }>;
    tips?: Array<{ zh: string; en?: string }>;
    citations?: Array<{ key?: string; chunkId?: number }>;
    drills?: Array<{ instruction: string; input: string; target?: string }>;
  }> {
    if (typeof hanziOrArgs === 'string') {
      const hanzi = hanziOrArgs;
      const normalized = {
        topic: hanzi,
        level: legacyOpts?.level,
        context: legacyOpts?.contextText,
        readPassage: undefined,
        maxPoints: 3,
        includeDrills: false,
        themes: undefined as string[] | undefined,
      };
      return this.generateGrammarNotesInternal(normalized);
    }
    return this.generateGrammarNotesInternal(hanziOrArgs);
  }

  private async generateGrammarNotesInternal(args: {
    topic: string;
    level?: number;
    context?: string; // concatenated context text
    readPassage?: { hanzi?: string; pinyin?: string; translation?: string };
    maxPoints?: number; // prefer 3–7
    includeDrills?: boolean; // add 3 transformation drills
    themes?: string[]; // optional categories to group points
  }): Promise<{
    grammarNotes?: Array<{
      point: string;
      brief: string;
      examples?: Array<{ zh: string; en?: string }>;
      sources?: Array<{ key?: string; chunkId?: number }>;
      // Optional enriched fields directly from the model
      pointPinyin?: string;
      pointEn?: string;
      briefPinyin?: string;
      briefEn?: string;
      examplesPinyin?: Array<{ zh: string; pinyin?: string; en?: string }>;
    }>;
    tips?: Array<{ zh: string; en?: string }>;
    citations?: Array<{ key?: string; chunkId?: number }>;
    drills?: Array<{ instruction: string; input: string; target?: string }>;
  }> {
    const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
    const maxPts = Math.min(Math.max(args.maxPoints ?? 3, 3), 7);
    const sys = `You are a precise Mandarin tutor. Using ONLY the provided context snippets and passage, explain grammar relevant to the topic. Prefer patterns/particles/word order; be concise. For any Chinese you output include it's English translation. Avoid speculation. Return STRICT JSON.`;
    const userParts = [
      args?.context
        ? `Grounding context (snippets):\n${args.context}\n`
        : undefined,
      args?.readPassage
        ? `Reading passage (for reference):\n${JSON.stringify(args.readPassage).slice(0, 2000)}\n`
        : undefined,
      `Topic: ${args.topic}`,
      `Level: HSK-${args.level ?? ''}`,
      args?.themes?.length ? `Themes: ${args.themes.join(', ')}` : undefined,
      `Return JSON EXACTLY like (limit grammarNotes to at most ${maxPts}):\n{
      "grammarNotes": [
        {
          "point": "把字句",
          "pointEn": "the 'ba' construction",
          "brief": "用于强调处置宾语；结构：主语 + 把 + 宾语 + 谓语",
          "briefEn": "Used to emphasize disposing of the object; structure: S + ba + O + V",
          "examples": [
            { "zh": "他把书放在桌子上。", "en": "He put the book on the table."}
          ]
        }
      ],
      "tips": [{"zh":"注意受事宾语通常已知。","en":"Note that the object is usually known to both parties."}],
      }`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const response = await (this.openai as any).responses.create({
      model,
      reasoning: { effort: 'low' },
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: sys,
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: userParts,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'GrammarNotes',
          schema: {
            type: 'object',
            properties: {
              grammarNotes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    point: { type: 'string' },
                    pointEn: { type: 'string' },
                    brief: { type: 'string' },
                    briefEn: { type: 'string' },
                    examples: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          zh: { type: 'string' },
                          en: { type: 'string' },
                        },
                        required: ['zh', 'en'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: [
                    'point',
                    'pointEn',
                    'brief',
                    'briefEn',
                    'examples',
                  ],
                  additionalProperties: false,
                },
              },
              tips: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    zh: { type: 'string' },
                    en: { type: 'string' },
                  },
                  required: ['zh', 'en'],
                  additionalProperties: false,
                },
              },
            },
            required: ['grammarNotes', 'tips'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = this.extractResponseText(response);
    if (!content) return {};
    try {
      const data = JSON.parse(content);
      if (data && typeof data === 'object') {
        // Enforce max 3 grammar notes as a safety
        if (Array.isArray(data.grammarNotes)) {
          data.grammarNotes = data.grammarNotes.slice(0, 3);
        }
        return data as any;
      }
    } catch (err) {
      this.logger.warn(
        `Error parsing grammar notes: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return {};
  }

  /**
   * Generate a short READ passage (hanzi, pinyin, translation) grounded by provided context.
   */
  async generateReadPassage(args: {
    title: string;
    level: number;
    context: string;
    maxChars?: number;
    logOnly?: boolean;
  }): Promise<{
    passage?: { hanzi: string; pinyin?: string; translation?: string };
    segments?: Array<{ zh: string; pinyin?: string; en?: string }>;
    questions?: Array<{
      type: 'tf' | 'short';
      prompt: string;
      translation: string;
      answer?: boolean;
      explanation?: string;
    }>;
  }> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const sys = `You are a precise Mandarin tutor. Author a SHORT leveled passage in Mandarin Chinese. Keep it concise and aligned to the target HSK level. Include translation. Also add 3 micro comprehension questions (T/F only). For T/F questions, provide clear correct answers and brief explanations.`;
    const user = `Title: ${args.title}
    \nLevel: HSK-${args.level}
    \nMax characters (Chinese): ${args.maxChars ?? 800}
    \nGrounding context (snippets):\n${args.context?.slice(0, 8000) || ''}

    \nReturn STRICT JSON:
    {
      "passage": { "hanzi": "...", "translation": "..." },
      "questions": [ 
        { 
          "type": "tf", 
          "prompt": "Chinese question text...", 
          "translation": "English translation of the question",
          "answer": true,
          "explanation": "Brief explanation of why this is correct/incorrect in english"
        } 
      ]
    }`;
    if (args.logOnly) {
      this.logger.log(`[ReadPassage prompt]\n${user}`, OpenAIService.name);
      return {};
    }

    const response = await (this.openai as any).responses.create({
      model,
      reasoning: { effort: 'low' },
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: sys,
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: user,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'ReadPassage',
          schema: {
            type: 'object',
            properties: {
              passage: {
                type: 'object',
                properties: {
                  hanzi: { type: 'string' },
                  translation: { type: 'string' },
                },
                required: ['hanzi', 'translation'],
                additionalProperties: false,
              },
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['tf', 'short'] },
                    prompt: { type: 'string' },
                    translation: { type: 'string' },
                    answer: { type: 'boolean' },
                    explanation: { type: 'string' },
                  },
                  required: [
                    'type',
                    'prompt',
                    'translation',
                    'answer',
                    'explanation',
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ['passage', 'questions'],
            additionalProperties: false,
          },
        },
      },
    });
    const content = this.extractResponseText(response);
    if (!content) return {};
    try {
      return JSON.parse(content);
    } catch (err) {
      this.logger.warn('Error parsing read passage JSON', err as any);
      return {};
    }
  }

  /**
   * Generate 5 MCQ quiz items based on READ + GRAMMAR and optional RAG context.
   */
  async generateQuizItems(args: {
    level: number;
    read: any;
    grammar: any;
    context?: string;
    numItems?: number;
    logOnly?: boolean;
  }): Promise<{
    items?: Array<{
      question: string;
      options: string[];
      answerIndex: number;
      rationale?: string;
    }>;
  }> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const n = Math.min(Math.max(args.numItems || 5, 3), 8);
    const sys = `You are a precise Mandarin pedagogy expert. Create fair MCQs that directly test comprehension of the given READ and GRAMMAR. Include at least one error-recognition item (choose the incorrect sentence) and for the options make it primarily in english for this. Provide brief rationales.`;
    const user = `GRAMMAR (notes/tips):
    ${JSON.stringify(args.grammar || {}).slice(0, 4000)}

    \nOptional grounding context:${(args.context || '').slice(0, 4000)}

    \nReturn STRICT JSON with ${n} items (no commentary):
    {
      "items": [
        { "question": "...", "options": ["A","B","C","D"], "answerIndex": 0, "rationale": "<primarily english explanation>" }
      ]
    }`;
    if (args.logOnly) {
      this.logger.log(`[QuizItems prompt]\n${user}`, OpenAIService.name);
      return {};
    }

    const response = await (this.openai as any).responses.create({
      model,
      reasoning: { effort: 'low' },
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: sys,
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: user,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'QuizItems',
          schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    question: { type: 'string' },
                    options: {
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                    },
                    answerIndex: { type: 'number' },
                    rationale: { type: 'string' },
                  },
                  required: ['question', 'options', 'answerIndex', 'rationale'],
                  additionalProperties: false,
                },
              },
            },
            required: ['items'],
            additionalProperties: false,
          },
        },
      },
    });
    const content = this.extractResponseText(response);
    if (!content) return {};
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed?.items)) {
        parsed.items = parsed.items.slice(0, n);
      }
      return parsed;
    } catch (err) {
      this.logger.warn('Error parsing quiz items JSON', err as any);
      return {};
    }
  }

  /**
   * Generate MCQ quiz items for a STORY lesson, based solely on the completed
   * story content. This is separate from curriculum quiz generation.
   */
  async generateQuizForStoryLesson(args: {
    level: number;
    title?: string | null;
    story: { hanzi: string; translation?: string | null };
    numItems?: number; // 3-5
  }): Promise<{
    items?: Array<{
      question: { zh: string; translation: string };
      options: Array<{ zh: string; translation: string }>;
      answerIndex: number;
      rationale?: string;
    }>;
  }> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const n = 3;
    const sys = `You are a precise Mandarin pedagogy expert. Create fair, SHORT multiple-choice questions to test comprehension of a given Chinese story. Keep difficulty appropriate for the target HSK level. Return STRICT JSON.`;
    const user = `Level: HSK-${args.level}
    \nTitle: ${args.title || ''}

    \nSTORY (Chinese):
    \nCHINESE:
    \n${(args.story?.hanzi || '').slice(0, 8000)}

    \nInstructions:
    - Produce ${n} items. Each item MUST have exactly 4 options.
    - Questions and options should be SHORT to MEDIUM length, relatively easy, level-appropriate.
    - Output Chinese in 'zh' fields and include English 'translation' for both question and each option.
    - Include 'answerIndex' (0-3) and a brief English 'rationale'.\n

    \nReturn STRICT JSON only:
    {
      "items": [
        {
          "question": { "zh": "...", "translation": "..." },
          "options": [
            { "zh": "...", "translation": "..." },
            { "zh": "...", "translation": "..." },
            { "zh": "...", "translation": "..." },
            { "zh": "...", "translation": "..." }
          ],
          "answerIndex": 0,
          "rationale": "brief english why"
        }
      ]
    }`;
    const response = await (this.openai as any).responses.create({
      model,
      reasoning: { effort: 'low' },
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: sys,
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: user,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'StoryQuizItems',
          schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    question: {
                      type: 'object',
                      properties: {
                        zh: { type: 'string' },
                        translation: { type: 'string' },
                      },
                      required: ['zh', 'translation'],
                      additionalProperties: false,
                    },
                    options: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          zh: { type: 'string' },
                          translation: { type: 'string' },
                        },
                        required: ['zh', 'translation'],
                        additionalProperties: false,
                      },
                    },
                    answerIndex: { type: 'number' },
                    rationale: { type: 'string' },
                  },
                  required: ['question', 'options', 'answerIndex', 'rationale'],
                  additionalProperties: false,
                },
              },
            },
            required: ['items'],
            additionalProperties: false,
          },
        },
      },
    });
    const content = this.extractResponseText(response);
    if (!content) return {};
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed?.items)) parsed.items = parsed.items.slice(0, n);
      return parsed;
    } catch (err) {
      this.logger.warn('Error parsing story quiz JSON', err as any);
      return {};
    }
  }

  /**
   * Generate MCQ quiz items for a DIALOGUE lesson, based solely on the
   * completed dialogue content. This is separate from curriculum quiz generation.
   */
  async generateQuizForDialogueLesson(args: {
    level: number;
    title?: string | null;
    dialogue: {
      turns: Array<{ hanzi: string; translation?: string; speaker?: string }>;
    };
    numItems?: number; // 3-5
  }): Promise<{
    items?: Array<{
      question: { zh: string; translation: string };
      options: Array<{ zh: string; translation: string }>;
      answerIndex: number;
      rationale?: string;
    }>;
  }> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const n = 3;
    const sys = `You are a precise Mandarin pedagogy expert. Create fair, SHORT multiple-choice questions to test comprehension of a given Chinese dialogue. Keep difficulty appropriate for the target HSK level. Return STRICT JSON.`;
    const joinedHanzi = (args.dialogue?.turns || [])
      .map((t, idx) => {
        const speaker = t.speaker || `Speaker ${idx + 1}`;
        return `${speaker}: ${t.hanzi || ''}`;
      })
      .join('\n');

    const user = `Level: HSK-${args.level}
    \nTitle: ${args.title || ''}

    \nDIALOGUE (Chinese):
    \nCHINESE TURNS:
    \n${joinedHanzi.slice(0, 8000)}

    \nInstructions:
    - Produce ${n} items. Each item MUST have exactly 4 options.
    - Questions and options should be SHORT to MEDIUM length, relatively easy, level-appropriate.
    - Output Chinese in 'zh' fields and include English 'translation' for both question and each option.
    - Include 'answerIndex' (0-3) and a brief English 'rationale'.\n

    \nReturn STRICT JSON only:
    {
      "items": [
        {
          "question": { "zh": "...", "translation": "..." },
          "options": [
            { "zh": "...", "translation": "..." },
            { "zh": "...", "translation": "..." },
            { "zh": "...", "translation": "..." },
            { "zh": "...", "translation": "..." }
          ],
          "answerIndex": 0,
          "rationale": "brief english why"
        }
      ]
    }`;
    const response = await (this.openai as any).responses.create({
      model,
      reasoning: { effort: 'low' },
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: sys,
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: user,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'DialogueQuizItems',
          schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    question: {
                      type: 'object',
                      properties: {
                        zh: { type: 'string' },
                        translation: { type: 'string' },
                      },
                      required: ['zh', 'translation'],
                      additionalProperties: false,
                    },
                    options: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          zh: { type: 'string' },
                          translation: { type: 'string' },
                        },
                        required: ['zh', 'translation'],
                        additionalProperties: false,
                      },
                    },
                    answerIndex: { type: 'number' },
                    rationale: { type: 'string' },
                  },
                  required: ['question', 'options', 'answerIndex', 'rationale'],
                  additionalProperties: false,
                },
              },
            },
            required: ['items'],
            additionalProperties: false,
          },
        },
      },
    });
    const content = this.extractResponseText(response);
    if (!content) return {};
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed?.items)) parsed.items = parsed.items.slice(0, n);
      return parsed;
    } catch (err) {
      this.logger.warn('Error parsing dialogue quiz JSON', err as any);
      return {};
    }
  }

  /**
   * Curriculum: Explain-first generator grounded by outline and RAG context.
   * Returns overview, sections (concept, examples, pitfalls, checks), microPassage, citations.
   */
  async generateCurriculumExplainLesson(args: {
    title: string;
    level: number;
    outline: Array<{ title: string }>;
    context: string;
    maxSections?: number;
    preferMicroPassageChars?: number;
    outlineIsFallback?: boolean;
    logOnly?: boolean;
  }): Promise<{
    overview?: string;
    sections?: Array<{
      title: string;
      conceptMd: string;
      examples: Array<{ zh: string; pinyin?: string; en?: string }>;
      pitfalls?: Array<{ bad: string; good: string; note?: string }>;
      checks?: Array<{ type: 'tf' | 'fill'; prompt: string; answer?: string }>;
    }>;
  }> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const maxSections = Math.min(Math.max(args.maxSections ?? 7, 1), 20);
    const outlineItems =
      Array.isArray(args.outline) && args.outline.length > 0
        ? args.outline
        : [{ title: args.title }];
    const usingFallback =
      Boolean(args.outlineIsFallback) ||
      !(Array.isArray(args.outline) && args.outline.length > 0);
    const outlineLabel = usingFallback
      ? 'Outline (single consolidated section):'
      : 'Outline (order matters):';
    const outlineLines = outlineItems
      .map((o, i) => `${i + 1}. ${o.title}`)
      .join('\n');
    const sectionDirective = usingFallback
      ? `\n2) "sections": EXACTLY 1 item (one consolidated explanation) because this subchapter has no sub-subchapters. Title it after the line in the outline above and do NOT invent extra sections.`
      : `\n2) "sections": EXACTLY ${maxSections} items in the SAME ORDER as the outline lines above, one per outline line. Each section MUST correspond to the respective outline title (use it as section.title verbatim unless minor normalization is needed).`;
    const sys = `You are a senior Mandarin curriculum designer. Create a comprehensive English EXPLAIN-FIRST lesson drawing exclusively from the provided context. Your goal is to capture ALL relevant information faithfully from the context—do not summarize or truncate. 
    - Begin with a detailed prose introduction for each section, followed by a varied mix of paragraphs, bullet points containing key points, and tables containing inventories/comparisons/information (using Markdown formatting: headings, bold, lists, tables, etc.) within the "conceptMd" field.
    - Alternate between formats for clarity; avoid redundancy or over-reliance on a single format.
    - Only include claims, facts, or points grounded in the supplied text—ignore unsupported information.
    - Do not truncate or condense: preserve the full scope and granularity of the context.
    - Use **simplified Chinese only** (omit traditional variants). Whenever you present Chinese text (inline, bullets, or tables), alwaysinclude **pinyin** and a brief **English gloss** right there so learners who cannot read Hanzi still benefit. It important to always include the pinyin for any chinese text. You do not need to include the english gloss if the presenting information is explaining about the chinese text. However, if the chinese text is a example, you should include the english gloss.
    - When you need a table, keep it compact and readable. Prefer columns like: Pattern/Expression | Pinyin | Meaning | Example (simplified + pinyin + English). Do NOT add a traditional column.
    - Avoid meta phrases like “examples from text/context”; just write “Examples” or list the items directly.
    - Keep length controlled: avoid runaway tables or long repetitive lists—group similar items instead of enumerating near-duplicates.
    - Avoid redundancy: do not repeat the same example/pattern across prose, bullets, tables, and the examples list. Present each unique example once.
    - Absolutely no hallucinations: include nothing that is not present in the provided context.
    
    \nOutput must be returned strictly as a well-formed JSON object, with the key "conceptMd" whose value is a Markdown-formatted string as described.
    
    \n**Important:**  
    - Output only the JSON object (no extra commentary or code blocks).  
    - Markdown formatting inside the JSON string is required.
    - Expand proportionally with context complexity to cover all points thoroughly.
    
    \n**Reminder:**  
    Your objective is to generate a comprehensive, Markdown-formatted explanation-first Mandarin grammar lesson grounded strictly and exhaustively in the provided context, with all information captured without summarization or truncation, formatted as a JSON object.`;

    const user = `Title: ${args.title}
    \n${outlineLabel}\n${outlineLines}
    \nGrounding context (snippets — include ALL relevant details from this):\n${args.context}\n

    \nConstruct (STRICT JSON):
    1) "overview": 3-6 sentences (English) summarizing what learners will master. Be thorough.
    2) Do NOT mention “from the context”, “provided context”, or any meta commentary. Write the content directly.

    ${sectionDirective} Each section MUST include
    - "title": string (English or Chinese, matching the outline item),
    - "conceptMd": string — a comprehensive Markdown explanation covering ALL key points from the grounding context for this section. Use:
      - Begin with a short prose intro before any list or table.
      - **Bold** key terms.
      - Mix formats: paragraphs for flow, bullets where concise, tables for inventories/comparisons. Avoid overusing any single format; avoid nested bullets and redundancy. Do not restate the same example in multiple formats.
      - Inline Chinese WITH pinyin + English gloss every time (no Hanzi-only snippets), and keep to simplified forms only. If the context provides traditional Chinese variants, do not use it. Only use simplified Chinese examples.
      - Tables: use compact columns (Pattern/Expression | Pinyin | Meaning | Example with simplified + pinyin + English). Group similar items rather than long repetitive lists; keep tables concise and readable. If an example appears in a table, do not repeat it again in bullets.
      - No hallucinated claims, forms, or patterns beyond what appears in the context.
      Stay thorough but concise; include everything the context provides without summarizing away detail. Do NOT include meta notes about context.
    - "examples": array of representative examples from the context. Each example: { "zh": "...", "pinyin": "...", "en": "..." } in simplified form only (omit traditional variants).
      - When the context is an inventory/list (e.g., initials/finals), show the full set in a compact table, and include only 2-6 illustrative examples (not one per item).
      - Otherwise, include up to 6 examples total; avoid near-duplicate examples. Do NOT repeat examples already shown verbatim inside conceptMd tables or bullets—use distinct examples or omit.
    - "pitfalls": array of common mistakes. Each: { "bad": "...", "good": "...", "note": "..." }. Include ALL that apply from context. Can be empty array if none. bad, good, and note should always be in an english first explanation.
    - "checks": array of 1-3 comprehension checks (decide the amount based on the section's complexity). Use T/F style: { "type": "tf", "prompt": "...", "answer": "T"|"F" }. Keep them concise and directly tied to the section’s points.

    \nReturn ONLY valid JSON with keys: overview, sections. No additional text.

    \nSCHEMA EXAMPLE (structure only — your content should be much more detailed):
    {
      "overview": "This lesson covers the fundamental SVO word order in Mandarin and introduces the aspect particle 了. Learners will understand when and how to use these patterns through extensive examples.",
      "sections": [
        {
          "title": "1.1.1 Word order: SVO",
          "conceptMd": "In Mandarin, the **default sentence order** is **Subject–Verb–Object (SVO)**, similar to English.\\n\\n**Key points:**\\n- The subject comes first\\n- The verb follows immediately\\n- The object comes last\\n\\n| Pattern | Example |\\n|---------|---------|\\n| S + V + O | 我吃苹果 |\\n\\nUnlike English, Mandarin does **not** change word order for questions in most cases.",
          "examples": [
            { "zh": "我吃苹果。", "pinyin": "wǒ chī píngguǒ", "en": "I eat apples." },
            { "zh": "他喝茶。", "pinyin": "tā hē chá", "en": "He drinks tea." },
            { "zh": "她看书。", "pinyin": "tā kàn shū", "en": "She reads books." },
            { "zh": "我们学中文。", "pinyin": "wǒmen xué zhōngwén", "en": "We study Chinese." }
          ],
          "pitfalls": [
            { "bad": "I apple eat. (我苹果吃。)", "good": "I eat apples. (我吃苹果。)", "note": "Explain pitfalls in English first; include the Chinese form in parentheses." }
          ],
          "checks": [
            { "type": "tf", "prompt": "Mandarin uses SVO order by default.", "answer": "T" }       
          ]
        }
      ],
    }`;
    if (args.logOnly) {
      this.logger.log(
        `[CurriculumExplainLesson prompt]\n${user}`,
        OpenAIService.name,
      );
      return {};
    }
    const response = await (this.openai as any).responses.create({
      model,
      reasoning: { effort: 'medium' },
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: sys,
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: user,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'CurriculumExplainLesson',
          schema: {
            type: 'object',
            properties: {
              overview: { type: 'string' },
              sections: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    conceptMd: { type: 'string' },
                    examples: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          zh: { type: 'string' },
                          pinyin: { type: 'string' },
                          en: { type: 'string' },
                        },
                        required: ['zh', 'pinyin', 'en'],
                        additionalProperties: false,
                      },
                    },
                    pitfalls: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          bad: { type: 'string' },
                          good: { type: 'string' },
                          note: { type: 'string' },
                        },
                        required: ['bad', 'good', 'note'],
                        additionalProperties: false,
                      },
                    },
                    checks: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          type: { type: 'string', enum: ['tf'] },
                          prompt: { type: 'string' },
                          answer: { type: 'string', enum: ['T', 'F'] },
                        },
                        required: ['type', 'prompt', 'answer'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: [
                    'title',
                    'conceptMd',
                    'examples',
                    'pitfalls',
                    'checks',
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ['overview', 'sections'],
            additionalProperties: false,
          },
        },
      },
    });
    const content = this.extractResponseText(response);
    if (!content) return {};
    try {
      const parsed = JSON.parse(content);
      // light shape guard
      if (Array.isArray(parsed?.sections)) {
        parsed.sections = parsed.sections.slice(0, maxSections);
      }
      return parsed;
    } catch (err) {
      this.logger.warn('Error parsing curriculum explain JSON', err as any);
      return {};
    }
  }
}
