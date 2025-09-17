import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth-token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface DueFlashcardItem {
  id: number;
  vocabId: number;
  hanzi: string;
  pinyin: string;
  definition: string;
  hskLevel: number | null;
  nextReview: string;
  sentences?: Array<{ hanzi: string; pinyin?: string; translation?: string }>;
}

export const flashcardsApi = {
  async create(params: { vocabId: number; sourceInstanceId?: number }) {
    const res = await api.post<{ flashcard: { id: number } }>(
      "/flashcards",
      params
    );
    return res.data;
  },

  async createByHanzi(hanzi: string) {
    const res = await api.post<{ flashcard: { id: number } }>("/flashcards", {
      hanzi,
    });
    return res.data;
  },

  async due(): Promise<DueFlashcardItem[]> {
    const res = await api.get<DueFlashcardItem[]>("/flashcards/due");
    return res.data;
  },

  async review(id: number, quality: number) {
    const res = await api.post<{
      flashcardId: number;
      newNextReview: string;
      newIntervalDays: number;
      newEasiness: number;
    }>(`/flashcards/${id}/review`, { quality });
    return res.data;
  },
};
