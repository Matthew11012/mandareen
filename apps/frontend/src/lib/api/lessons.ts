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

export interface LessonListItem {
  id: number;
  title: string | null;
  level: number;
  createdAt: string;
  lessonType: string;
  titlePinyin: string | null;
  titleTranslation: string | null;
}

export interface LessonSection {
  id: number;
  sectionType: string;
  content: unknown;
}

export interface LessonDetail {
  id: number;
  level: number;
  title: string | null;
  createdAt: string;
  sections: LessonSection[];
  finished?: boolean;
}

export const lessonsApi = {
  async generate(params: {
    level?: number;
    type?: "story" | "dialogue";
    readTimeMinutes?: number;
    topic?: string;
  }) {
    const res = await api.post<{ id: number }>("/lessons/generate", params);
    return res.data;
  },
  async list(params?: { level?: number; levels?: number[] }) {
    const res = await api.get<LessonListItem[]>("/lessons", {
      params: {
        level: params?.level,
        levels:
          params?.levels && params.levels.length > 0
            ? params.levels.join(",")
            : undefined,
      },
    });
    return res.data;
  },
  async listMine(params?: { level?: number; levels?: number[] }) {
    const res = await api.get<LessonListItem[]>("/lessons/mine", {
      params: {
        level: params?.level,
        levels:
          params?.levels && params.levels.length > 0
            ? params.levels.join(",")
            : undefined,
      },
    });
    return res.data;
  },
  async getById(id: number) {
    const res = await api.get<LessonDetail>(`/lessons/${id}`);
    return res.data;
  },
  async finish(id: number) {
    await api.post(`/lessons/${id}/finish`, {});
  },
  async getProgressCount() {
    const res = await api.get<{ finishedCount: number }>(
      `/lessons/progress/count`
    );
    return res.data;
  },
  async getFinishedIds() {
    const res = await api.get<{ ids: number[] }>(`/lessons/progress/ids`);
    return res.data;
  },
  async getProgressByLevel() {
    const res = await api.get<{ byLevel: Record<number, number> }>(
      `/lessons/progress/by-level`
    );
    return res.data;
  },
  async getStudyStreak() {
    const offsetMinutes =
      typeof window !== "undefined" ? -new Date().getTimezoneOffset() : 0;
    const res = await api.get<{ streakDays: number }>(
      `/lessons/progress/streak`,
      { params: { offsetMinutes } }
    );
    return res.data;
  },
  async getWordsRead() {
    const res = await api.get<{ readCount: number }>(
      `/lessons/progress/words-read`
    );
    return res.data;
  },
  async getWordsReadByHsk() {
    const res = await api.get<{ byHsk: Record<string, number> }>(
      `/lessons/progress/words-read-by-hsk`
    );
    return res.data;
  },
};
