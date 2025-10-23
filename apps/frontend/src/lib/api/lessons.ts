import { get, post } from "../http/http";

export interface LessonListItem {
  id: number;
  title: string | null;
  level: number;
  createdAt: string;
  lessonType: string;
  titlePinyin: string | null;
  titleTranslation: string | null;
  tags: string[];
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

export interface AvailableTags {
  timeframe: Array<{ tag: string; count: number }>;
  content: Array<{ tag: string; count: number }>;
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
  async listTags() {
    return get<AvailableTags>("lessons/tags");
  },
  async list(params?: {
    level?: number;
    levels?: number[];
    timeframeTags?: string[];
    contentTags?: string[];
    includeUntagged?: boolean;
  }) {
    const qs = new URLSearchParams();
    if (typeof params?.level === "number")
      qs.set("level", String(params.level));
    if (params?.levels && params.levels.length > 0)
      qs.set("levels", params.levels.join(","));
    if (params?.timeframeTags && params.timeframeTags.length > 0)
      qs.set("timeframeTags", params.timeframeTags.join(","));
    if (params?.contentTags && params.contentTags.length > 0)
      qs.set("contentTags", params.contentTags.join(","));
    if (params?.includeUntagged === true) qs.set("includeUntagged", "true");
    const path = `lessons${qs.toString() ? `?${qs}` : ""}`;
    return get<LessonListItem[]>(path);
  },
  async listMine(params?: {
    level?: number;
    levels?: number[];
    timeframeTags?: string[];
    contentTags?: string[];
    includeUntagged?: boolean;
  }) {
    const qs = new URLSearchParams();
    if (typeof params?.level === "number")
      qs.set("level", String(params.level));
    if (params?.levels && params.levels.length > 0)
      qs.set("levels", params.levels.join(","));
    if (params?.timeframeTags && params.timeframeTags.length > 0)
      qs.set("timeframeTags", params.timeframeTags.join(","));
    if (params?.contentTags && params.contentTags.length > 0)
      qs.set("contentTags", params.contentTags.join(","));
    if (params?.includeUntagged === true) qs.set("includeUntagged", "true");
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
  async getWordsTimeline(params?: { from?: string; to?: string }) {
    const offsetMinutes =
      typeof window !== "undefined" ? -new Date().getTimezoneOffset() : 0;
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    qs.set("offsetMinutes", String(offsetMinutes));
    const path = `lessons/progress/words-timeline?${qs}`;
    return get<{
      points: Array<{ date: string; new: number; learned: number }>;
      totals: { new: number; learned: number };
    }>(path);
  },
};
