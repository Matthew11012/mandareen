import { get, post, del } from "../http/http";

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

export interface FlashcardListItem {
  id: number;
  vocabId: number;
  hanzi: string;
  pinyin: string;
  definition: string;
  hskLevel: number | null;
  nextReview: string;
  createdAt: string;
}

export interface ListAllResponse {
  items: FlashcardListItem[];
  nextCursor?: { createdAt: string; id: number };
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

  async listAll(
    limit?: number,
    cursor?: { createdAt: string; id: number }
  ): Promise<ListAllResponse> {
    const params = new URLSearchParams();
    if (limit) params.set("limit", limit.toString());
    if (cursor) {
      params.set("cursorCreatedAt", cursor.createdAt);
      params.set("cursorId", cursor.id.toString());
    }
    const query = params.toString();
    return get<ListAllResponse>(`flashcards${query ? `?${query}` : ""}`);
  },

  async remove(id: number) {
    return del<{ deleted: number }>(`flashcards/${id}`);
  },

  async removeMany(ids: number[]) {
    return post<{ deleted: number }>("flashcards/bulk-delete", { ids });
  },
};
