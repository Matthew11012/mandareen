import { get, post } from "../http/http";

export interface DueFlashcardItem {
  id: number;
  vocabId: number;
  hanzi: string;
  pinyin: string;
  definition: string;
  hskLevel: number | null;
  nextReview: string;
  sentences?: Array<{
    hanzi: string;
    pinyin?: string;
    translation?: string;
    segments?: Array<{
      text: string;
      isWord: boolean;
      pinyin?: string;
      definition?: string;
      definitions?: string[];
      hskLevel?: number;
    }>;
  }>;
}

export const flashcardsApi = {
  async create(params: { vocabId: number; sourceInstanceId?: number }) {
    return post<{ flashcard: { id: number } }>("flashcards", params);
  },

  async createByHanzi(hanzi: string) {
    return post<{ flashcard: { id: number } }>("flashcards", { hanzi });
  },

  async due(): Promise<DueFlashcardItem[]> {
    return get<DueFlashcardItem[]>("flashcards/due");
  },

  async review(id: number, quality: number) {
    return post<{
      flashcardId: number;
      newNextReview: string;
      newIntervalDays: number;
      newEasiness: number;
    }>(`flashcards/${id}/review`, { quality });
  },
};
