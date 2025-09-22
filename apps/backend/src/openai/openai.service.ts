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
        // language can be set to zh if needed: language: 'zh',
      } as any);
      const text = (result as any)?.text || '';
      return (text || '').trim();
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
  async annotateChinese(text: string): Promise<
    Array<{
      text: string;
      pinyin?: string;
      definition?: string;
      hskLevel?: number;
    }>
  > {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a Mandarin lexical annotator. Given the user Chinese text, extract a small list (10–25) of important words and short phrases (multi-character collocations where appropriate). For each, include exact substring matching the text, its pinyin, and a concise English definition. Return STRICT JSON: {"vocabulary":[{"text":"...","pinyin":"...","definition":"..."}]}. No commentary. Only include items that appear verbatim in the text.',
        },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    } as any);
    const content = completion.choices?.[0]?.message?.content;
    if (!content) return [];
    try {
      const data = JSON.parse(content);
      const vocab = Array.isArray(data?.vocabulary) ? data.vocabulary : [];
      return vocab
        .filter(
          (v: any) => typeof v?.text === 'string' && v.text.trim().length > 0,
        )
        .map((v: any) => ({
          text: v.text,
          pinyin: (v.pinyin || '').toLowerCase(),
          definition: v.definition || v.translation || undefined,
          hskLevel: typeof v.hskLevel === 'number' ? v.hskLevel : undefined,
        }));
    } catch {
      return [];
    }
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
      "pinyin": "The full passage in pinyin",
      "translation": "English translation of the passage",
      "words": [
        {
          "text": "Chinese word or character",
          "pinyin": "Pronunciation in pinyin",
          "hskLevel": HSK level of this word (number),
          "definition": "English definition"
        },
        ...more words
      ]
    }
    
    Include ALL words in the "words" array, focusing on ALL vocabulary from the passage that students at this level should know.
    For levels 1-3, include some words from the next HSK level to challenge students.
    For levels 4+, include a few advanced words that might be unfamiliar.
    `;
  }
}
