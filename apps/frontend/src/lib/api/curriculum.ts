export type CurriculumUnit = {
  id: number;
  title: string;
  description?: string | null;
  totalLessons: number;
  completedLessons: number;
};

export type CurriculumLesson = {
  id: number;
  title: string;
  description?: string | null;
  order: number;
  completed?: boolean;
  latestQuizScore?: number | null;
  activities?: Array<
    | { id: number; type: "READ"; levelBand: number; content: unknown }
    | { id: number; type: "GRAMMAR"; levelBand: number; content: unknown }
    | { id: number; type: "QUIZ"; levelBand: number; content: unknown }
    | { id: number; type: string; levelBand: number; content: unknown }
  >;
};

import { get, post } from "../http/http";

export type CurriculumSource = {
  id: number;
  key: string;
  title: string;
  type: string;
  language: string;
};

export async function listSources(): Promise<CurriculumSource[]> {
  return get<CurriculumSource[]>("curriculum/sources");
}

export async function listUnits(opts?: {
  sourceId?: number;
  source?: string;
}): Promise<CurriculumUnit[]> {
  const params = new URLSearchParams();
  if (typeof opts?.sourceId === "number")
    params.set("sourceId", String(opts.sourceId));
  if (opts?.source) params.set("source", opts.source);
  const qs = params.toString();
  return get<CurriculumUnit[]>(`curriculum/units${qs ? `?${qs}` : ""}`);
}

export async function getUnit(unitId: number): Promise<{
  id: number;
  title: string;
  description?: string | null;
  lessons: CurriculumLesson[];
}> {
  return get<{
    id: number;
    title: string;
    description?: string | null;
    lessons: CurriculumLesson[];
  }>(`curriculum/units/${unitId}`);
}

export async function getLesson(
  unitId: number,
  lessonId: number
): Promise<CurriculumLesson> {
  return get<CurriculumLesson>(
    `curriculum/units/${unitId}/lessons/${lessonId}`
  );
}

export async function generateLesson(
  unitId: number,
  lessonId: number,
  opts: { levelBand?: number; force?: boolean } = {}
): Promise<CurriculumLesson> {
  return post<CurriculumLesson>(
    `curriculum/units/${unitId}/lessons/${lessonId}/generate`,
    {
      levelBand: opts.levelBand ?? 1,
      force: !!opts.force,
    },
    {
      timeoutMs: 120000, // 2 minutes timeout for lesson generation
    }
  );
}

export async function submitAttempt(
  activityId: number,
  payload: unknown,
  score?: number
): Promise<{ ok: true }> {
  return post<{ ok: true }>(`curriculum/activities/${activityId}/attempt`, {
    payload,
    score,
  });
}

export async function getLessonNavigation(
  unitId: number,
  lessonId: number,
  opts?: { sourceId?: number; source?: string }
): Promise<{
  previous: {
    unitId: number;
    unitTitle: string;
    lessonId: number;
    lessonTitle: string;
    lessonOrder: number;
  } | null;
  next: {
    unitId: number;
    unitTitle: string;
    lessonId: number;
    lessonTitle: string;
    lessonOrder: number;
  } | null;
}> {
  const params = new URLSearchParams();
  if (typeof opts?.sourceId === "number")
    params.set("sourceId", String(opts.sourceId));
  if (opts?.source) params.set("source", opts.source);
  const qs = params.toString();
  return get<{
    previous: {
      unitId: number;
      unitTitle: string;
      lessonId: number;
      lessonTitle: string;
      lessonOrder: number;
    } | null;
    next: {
      unitId: number;
      unitTitle: string;
      lessonId: number;
      lessonTitle: string;
      lessonOrder: number;
    } | null;
  }>(
    `curriculum/units/${unitId}/lessons/${lessonId}/navigation${qs ? `?${qs}` : ""}`
  );
}

export async function getUnitNavigation(
  unitId: number,
  opts?: { sourceId?: number; source?: string }
): Promise<{
  previous: {
    id: number;
    title: string;
    order: number;
  } | null;
  next: {
    id: number;
    title: string;
    order: number;
  } | null;
}> {
  const params = new URLSearchParams();
  if (typeof opts?.sourceId === "number")
    params.set("sourceId", String(opts.sourceId));
  if (opts?.source) params.set("source", opts.source);
  const qs = params.toString();
  return get<{
    previous: { id: number; title: string; order: number } | null;
    next: { id: number; title: string; order: number } | null;
  }>(`curriculum/units/${unitId}/navigation${qs ? `?${qs}` : ""}`);
}
