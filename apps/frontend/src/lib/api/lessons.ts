import { get, post } from "../http/http";

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
    return post<{ id: number }>("lessons/generate", params);
  },
  async list(params?: { level?: number; levels?: number[] }) {
    const qs = new URLSearchParams();
    if (typeof params?.level === "number")
      qs.set("level", String(params.level));
    if (params?.levels && params.levels.length > 0)
      qs.set("levels", params.levels.join(","));
    const path = `lessons${qs.toString() ? `?${qs}` : ""}`;
    return get<LessonListItem[]>(path);
  },
  async listMine(params?: { level?: number; levels?: number[] }) {
    const qs = new URLSearchParams();
    if (typeof params?.level === "number")
      qs.set("level", String(params.level));
    if (params?.levels && params.levels.length > 0)
      qs.set("levels", params.levels.join(","));
    const path = `lessons/mine${qs.toString() ? `?${qs}` : ""}`;
    return get<LessonListItem[]>(path);
  },
  async getById(id: number) {
    return get<LessonDetail>(`lessons/${id}`);
  },
  async finish(id: number) {
    await post(`lessons/${id}/finish`, {});
  },
  async getProgressCount() {
    return get<{ finishedCount: number }>(`lessons/progress/count`);
  },
  async getFinishedIds() {
    return get<{ ids: number[] }>(`lessons/progress/ids`);
  },
  async getProgressByLevel() {
    return get<{ byLevel: Record<number, number> }>(
      `lessons/progress/by-level`
    );
  },
  async getStudyStreak() {
    const offsetMinutes =
      typeof window !== "undefined" ? -new Date().getTimezoneOffset() : 0;
    const path = `lessons/progress/streak?offsetMinutes=${offsetMinutes}`;
    return get<{ streakDays: number }>(path);
  },
  async getStudyStreakStatus() {
    const offsetMinutes =
      typeof window !== "undefined" ? -new Date().getTimezoneOffset() : 0;
    const path = `lessons/progress/streak-status?offsetMinutes=${offsetMinutes}`;
    return get<{
      todayContinued: boolean;
      streakDays: number;
      carryOverDays: number;
      lastActivityLocalDate: string | null;
    }>(path);
  },
  async getWordsRead() {
    return get<{ readCount: number }>(`lessons/progress/words-read`);
  },
  async getWordsReadByHsk() {
    return get<{ byHsk: Record<string, number> }>(
      `lessons/progress/words-read-by-hsk`
    );
  },
};
