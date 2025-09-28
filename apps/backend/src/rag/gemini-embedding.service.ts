import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class GeminiEmbeddingService {
  private readonly logger = new Logger(GeminiEmbeddingService.name);
  private readonly ai: GoogleGenAI;
  private readonly requestTimestamps: number[] = [];
  private lastRequestAt = 0;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
    });
    this.logger.log('Gemini embedding service initialized with @google/genai');
  }

  /**
   * Generate embeddings using Gemini embedding model via @google/genai
   * @param texts Array of texts to embed
   * @returns Array of embedding vectors
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    if (!Array.isArray(texts) || texts.length === 0) {
      return [];
    }

    // Filter out empty or whitespace-only texts
    const validTexts = texts
      .map((text) => (text || '').trim())
      .filter((text) => text.length > 0);

    if (validTexts.length === 0) {
      this.logger.warn('All texts are empty, returning empty embeddings');
      return [];
    }

    try {
      const results: number[][] = [];

      // Process texts in batches to avoid rate limits
      const batchSize = 100;
      for (let i = 0; i < validTexts.length; i += batchSize) {
        const batch = validTexts.slice(i, i + batchSize);

        // Throttle to respect 30 RPM free-tier
        await this.throttle();

        // Use @google/genai API for batch processing with retry/backoff
        const response = await this.withRetry(async () =>
          this.ai.models.embedContent({
            model: 'gemini-embedding-001',
            contents: batch,
            config: {
              outputDimensionality: 1536,
              taskType: 'SEMANTIC_SIMILARITY',
            },
          }),
        );

        // Extract embeddings from response
        if (response.embeddings) {
          const embeddings = response.embeddings
            .map((e) => e.values)
            .filter((values) => values !== undefined) as number[][];

          // Log actual dimensions for debugging
          if (embeddings.length > 0) {
            const actualDim = embeddings[0].length;
            this.logger.log(
              `Gemini returned embeddings with ${actualDim} dimensions (requested 1536)`,
            );
          }

          results.push(...embeddings);
        }

        // Small additional spacing between requests (helps avoid bursts)
        if (i + batchSize < validTexts.length) {
          await this.sleep(150); // light spacing between batches
        }
      }

      this.logger.log(
        `Generated ${results.length} Gemini embeddings via @google/genai (from ${validTexts.length} valid texts)`,
      );
      return results;
    } catch (error) {
      this.logger.error('Error generating Gemini embeddings:', error);

      if (
        error.message?.includes('API_KEY_INVALID') ||
        error.message?.includes('invalid_api_key')
      ) {
        this.logger.error(
          'Invalid Gemini API key. Please check your GEMINI_API_KEY environment variable.',
        );
      } else if (
        error.message?.includes('QUOTA_EXCEEDED') ||
        error.message?.includes('quota_exceeded')
      ) {
        this.logger.error(
          'Gemini API quota exceeded. Please check your usage limits.',
        );
      }

      throw new Error(`Gemini embedding failed: ${error.message}`);
    }
  }

  /**
   * Simple RPM throttle: ensure <= 28 requests in any rolling 60s window
   * and keep at least ~2100ms between requests (30 RPM safety margin)
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    // Enforce minimal spacing between requests (~2.1s)
    const minSpacingMs = 2100;
    const sinceLast = now - this.lastRequestAt;
    if (sinceLast < minSpacingMs) {
      await this.sleep(minSpacingMs - sinceLast);
    }

    // Clean timestamps older than 60s
    const oneMinuteAgo = Date.now() - 60_000;
    while (
      this.requestTimestamps.length &&
      this.requestTimestamps[0] < oneMinuteAgo
    ) {
      this.requestTimestamps.shift();
    }

    // If at limit (28 within last minute), wait until oldest drops out
    const maxPerMinute = 28; // leave headroom below 30 RPM
    if (this.requestTimestamps.length >= maxPerMinute) {
      const waitMs = this.requestTimestamps[0] + 60_000 - Date.now();
      if (waitMs > 0) {
        this.logger.warn(
          `Gemini RPM throttle: waiting ${Math.ceil(waitMs)}ms to respect rate limits`,
        );
        await this.sleep(waitMs);
      }
    }

    // Record this request
    this.requestTimestamps.push(Date.now());
    this.lastRequestAt = Date.now();
  }

  /** Exponential backoff for 429/5xx with jitter */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    const maxRetries = 5;
    let attempt = 0;
    let lastErr: any;
    while (attempt <= maxRetries) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const msg = err?.message || '';
        const isRetryable =
          err?.status === 429 ||
          err?.status >= 500 ||
          /RESOURCE_EXHAUSTED|rate limit|temporarily unavailable/i.test(msg);
        if (!isRetryable || attempt === maxRetries) break;
        const base = 600; // ms
        const backoff = Math.min(8000, base * Math.pow(2, attempt));
        const jitter = Math.floor(Math.random() * 250);
        const waitMs = backoff + jitter;
        this.logger.warn(
          `Gemini retry ${attempt + 1}/${maxRetries} after ${waitMs}ms (reason: ${msg})`,
        );
        await this.sleep(waitMs);
        attempt++;
      }
    }
    throw lastErr;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Generate a single embedding
   * @param text Text to embed
   * @returns Embedding vector
   */
  async embedText(text: string): Promise<number[]> {
    const embeddings = await this.embedTexts([text]);
    return embeddings[0] || [];
  }

  /**
   * Check if Gemini service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.embedText('test');
      return true;
    } catch (error) {
      this.logger.warn('Gemini service not available:', error.message);
      return false;
    }
  }

  /**
   * Get embedding dimensions (Gemini embedding-001 returns 1536 dimensions)
   */
  getDimensions(): number {
    return 1536;
  }
}
