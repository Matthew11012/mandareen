import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
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

  async generateAssessmentPassage(hskLevel: number): Promise<Passage> {
    try {
      const prompt = this.createPassagePrompt(hskLevel);

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-5o-mini',
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

      // Add unique ID to passage
      return {
        id: uuidv4(),
        ...passageData,
        targetHskLevel: hskLevel,
      };
    } catch (error) {
      const openaiError = error as OpenAIError;
      this.logger.error(
        `Error generating passage for HSK level ${hskLevel}:`,
        openaiError,
      );
      throw new Error(`Failed to generate passage: ${openaiError.message}`);
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
    
    Include at least 15 words in the "words" array, focusing on key vocabulary from the passage that students at this level should know.
    For levels 1-3, include some words from the next HSK level to challenge students.
    For levels 4+, include a few advanced words that might be unfamiliar.
    `;
  }
}
