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
   */
  async transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
    const model = process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe';
    // Persist to a temp file to ensure compatibility with OpenAI SDK file upload
    const ext = this.mimeToExtension(mimeType) || 'webm';
    const tempDir = path.resolve(process.cwd(), 'uploads', 'tmp');
    await fs.promises.mkdir(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `stt-${Date.now()}.${ext}`);
    await fs.promises.writeFile(tempFile, buffer);
    try {
      const fileStream = fs.createReadStream(tempFile);
      const result = await this.openai.audio.transcriptions.create({
        file: fileStream as any,
        model,
        // Hint the target language and bias model to Simplified Chinese output
        language: 'zh',
        prompt:
          '请使用简体中文（简体字）进行转写，不要使用繁体字。若听到中文请一律以简体字输出。',
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
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const maxPts = Math.min(Math.max(args.maxPoints ?? 3, 3), 7);
    const sys = `You are a precise Mandarin tutor. Using ONLY the provided context snippets and passage, explain grammar relevant to the topic. Prefer patterns/particles/word order; be concise.
  For any Chinese you output, include pinyin and a brief English gloss. Avoid speculation. Return STRICT JSON.`;
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
      "pointPinyin": "bǎ zì jù",
      "pointEn": "the 'ba' construction",
      "brief": "用于强调处置宾语；结构：主语 + 把 + 宾语 + 谓语",
      "briefPinyin": "yòng yú qiángdiào chǔzhì bīnyǔ; jiégòu: zhǔyǔ + bǎ + bīnyǔ + wèiyǔ",
      "briefEn": "Used to emphasize disposing of the object; structure: S + ba + O + V",
      "examples": [
        { "zh": "他把书放在桌子上。", "en": "He put the book on the table.", "pinyin": "tā bǎ shū fàng zài zhuōzi shàng" }
      ],
      "sources": [{"key":"S1"}]
    }
  ],
  "tips": [{"zh":"注意受事宾语通常已知。","en":"Note that the object is usually known to both parties."}],
  "citations": [{"key":"S1"}],
  "drills": [
    { "instruction": "Add 了 where appropriate", "input": "他___吃饭。" }
  ]
}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userParts },
      ],
      response_format: { type: 'json_object' },
    } as any);
    const content = completion.choices?.[0]?.message?.content;
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
      this.logger.warn('Error parsing grammar notes', err as any);
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
    Level: HSK-${args.level}
    Max characters (Chinese): ${args.maxChars ?? 800}
    Grounding context (snippets):\n${args.context?.slice(0, 8000) || ''}

    Return STRICT JSON:
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
    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    } as any);
    const content = completion.choices?.[0]?.message?.content;
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
    const sys = `You are a precise Mandarin pedagogy expert. Create fair MCQs that directly test comprehension of the given READ and GRAMMAR. Include at least one error-recognition item (choose the incorrect sentence). Provide brief rationales.`;
    const user = `Level: HSK-${args.level}
    READ (Chinese/pinyin/translation):
    ${JSON.stringify(args.read || {}).slice(0, 4000)}

    GRAMMAR (notes/tips):
    ${JSON.stringify(args.grammar || {}).slice(0, 4000)}

    Optional grounding context:
    ${(args.context || '').slice(0, 4000)}

    Return STRICT JSON with ${n} items (no commentary):
    {
      "items": [
        { "question": "...", "options": ["A","B","C","D"], "answerIndex": 0, "rationale": "<primarily english explanation>" }
      ]
    }`;
    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    } as any);
    const content = completion.choices?.[0]?.message?.content;
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
    const user = `Level: HSK-${args.level}\n
    Title: ${args.title || ''}\n

    STORY (Chinese):\n
    CHINESE:\n
    ${(args.story?.hanzi || '').slice(0, 8000)}\n

    Instructions:\n
    - Produce ${n} items. Each item MUST have exactly 4 options.
    - Questions and options should be SHORT to MEDIUM length, relatively easy, level-appropriate.
    - Output Chinese in 'zh' fields and include English 'translation' for both question and each option.
    - Include 'answerIndex' (0-3) and a brief English 'rationale'.\n

    Return STRICT JSON only:
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
    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    } as any);
    const content = completion.choices?.[0]?.message?.content;
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
    dialogue: { turns: Array<{ hanzi: string; translation?: string }> };
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
      .map((t) => `${t.hanzi || ''}`)
      .join('\n');

    const user = `Level: HSK-${args.level}\n
    Title: ${args.title || ''}\n

    DIALOGUE (Chinese):\n
    CHINESE TURNS:\n
    ${joinedHanzi.slice(0, 8000)}\n

    Instructions:\n
    - Produce ${n} items. Each item MUST have exactly 4 options.
    - Questions and options should be SHORT to MEDIUM length, relatively easy, level-appropriate.
    - Output Chinese in 'zh' fields and include English 'translation' for both question and each option.
    - Include 'answerIndex' (0-3) and a brief English 'rationale'.\n

    Return STRICT JSON only:
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
    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    } as any);
    const content = completion.choices?.[0]?.message?.content;
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
  }): Promise<{
    overview?: string;
    sections?: Array<{
      title: string;
      concept: string;
      examples: Array<{ zh: string; pinyin?: string; en?: string }>;
      pitfalls?: Array<{ bad: string; good: string; note?: string }>;
      checks?: Array<{ type: 'tf' | 'fill'; prompt: string; answer?: string }>;
    }>;
    microPassage?: { hanzi: string; pinyin?: string; translation?: string };
    citations?: Array<{ key?: string; chunkId?: number }>;
  }> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const maxSections = Math.min(Math.max(args.maxSections ?? 7, 1), 20);
    const microChars = Math.min(
      Math.max(args.preferMicroPassageChars ?? 220, 120),
      400,
    );
    const sys = `You are a senior Mandarin curriculum designer. Create an EXPLAIN-FIRST lesson in English with Chinese examples. Be concise, accurate, and grounded STRICTLY by the provided outline and context. If a claim is not supported by the context, omit it. Return STRICT JSON.`;
    const user = `Title: ${args.title}
    Level: HSK-${args.level}
    Outline (order matters):\n${args.outline.map((o, i) => `${i + 1}. ${o.title}`).join('\n')}
    Grounding context (snippets):\n${args.context.slice(0, 8000)}

      Construct (STRICT):
      1) "overview": 2-4 sentences (English) summarizing what learners will learn.
      2) "sections": EXACTLY ${maxSections} items and in the SAME ORDER as the outline lines above, one per outline line. Each section MUST correspond to the respective outline title (use it as section.title verbatim unless minor normalization is needed). Each section must include:
      - title (English or Chinese),
      - concept (English),
      - 2-3 examples with Chinese, pinyin, English,
      - pitfalls (min 1 if applicable): {bad, good, note} all should be in english, emphasize minimal pairs/contrasts and "say X, not Y" patterns when relevant,
      - 2 short checks: type tf|fill with prompt and answer.
      3) "microPassage": ${microChars} chars Chinese max, with translation (short), integrating 1-2 key points.
    4) "citations": optional [{key, chunkId}] referencing context markers like [S1].

      Return ONLY JSON with keys overview, sections, microPassage, citations.

      EXAMPLE (shape only; keep content brief and grounded):
      {
        "overview": "This subchapter explains basic phrase order and common particles.",
        "sections": [
          {
            "title": "1. Word order: SVO",
            "concept": "In Mandarin, the default order is Subject–Verb–Object.",
            "examples": [
              { "zh": "我吃苹果。", "pinyin": "wǒ chī píngguǒ", "en": "I eat apples." },
              { "zh": "他喝茶。", "pinyin": "tā hē chá", "en": "He drinks tea." }
            ],
            "pitfalls": [
              { "bad": "我苹果吃。", "good": "我吃苹果。", "note": "Keep SVO order." }
            ],
            "checks": [
              { "type": "tf", "prompt": "Mandarin defaults to SVO order.", "answer": "T" },
              { "type": "fill", "prompt": "他__饭。 (eat)", "answer": "吃" }
            ]
          },
          {
            "title": "2. Particle 了 (le)",
            "concept": "了 often marks a completed action.",
            "examples": [
              { "zh": "我吃了饭。", "pinyin": "wǒ chī le fàn", "en": "I ate (already)." }
            ],
            "pitfalls": [
              { "bad": "Treat syllables like English 'lettuce' parts (no meaning).", "good": "Note meanings of individual Mandarin syllables.", "note": "With very few exceptions (e.g., suffix 子), syllables carry meaning." }
            ],
            "checks": [
              { "type": "tf", "prompt": "了 always indicates past tense.", "answer": "F" },
              { "type": "fill", "prompt": "他__了茶。 (drink)", "answer": "喝" }
            ]
          }
        ],
        "microPassage": {
          "hanzi": "今天我吃了米饭，也喝了茶。",
          "pinyin": "jīntiān wǒ chī le mǐfàn, yě hē le chá",
          "translation": "Today I ate rice and also drank tea."
        },
        "citations": [{ "key": "S1" }]
      }`;
    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    } as any);
    const content = completion.choices?.[0]?.message?.content;
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
