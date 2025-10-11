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
  activities?: Array<
    | { id: number; type: "READ"; levelBand: number; content: unknown }
    | { id: number; type: "GRAMMAR"; levelBand: number; content: unknown }
    | { id: number; type: "QUIZ"; levelBand: number; content: unknown }
    | { id: number; type: string; levelBand: number; content: unknown }
  >;
};

const RAW_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3000";

const NORMALIZED_BASE = RAW_BASE.replace(/\/$/, "");
const API_BASE = NORMALIZED_BASE.endsWith("/api")
  ? NORMALIZED_BASE
  : `${NORMALIZED_BASE}/api`;

async function apiFetch(path: string, init?: RequestInit) {
  const url = `${API_BASE}/${path}`.replace(/([^:]\/)\/+/g, "$1");
  const headers = new Headers(init?.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("auth-token");
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

export type CurriculumSource = {
  id: number;
  key: string;
  title: string;
  type: string;
  language: string;
};

export async function listSources(): Promise<CurriculumSource[]> {
  return apiFetch("curriculum/sources");
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
  return apiFetch(`curriculum/units${qs ? `?${qs}` : ""}`);
}

export async function getUnit(unitId: number): Promise<{
  id: number;
  title: string;
  description?: string | null;
  lessons: CurriculumLesson[];
}> {
  return apiFetch(`curriculum/units/${unitId}`);
}

export async function getLesson(
  unitId: number,
  lessonId: number
): Promise<CurriculumLesson> {
  return apiFetch(`curriculum/units/${unitId}/lessons/${lessonId}`);
}

export async function generateLesson(
  unitId: number,
  lessonId: number,
  opts: { levelBand?: number; force?: boolean } = {}
): Promise<CurriculumLesson> {
  return apiFetch(`curriculum/units/${unitId}/lessons/${lessonId}/generate`, {
    method: "POST",
    body: JSON.stringify({
      levelBand: opts.levelBand ?? 1,
      force: !!opts.force,
    }),
  });
}

export async function submitAttempt(
  activityId: number,
  payload: unknown,
  score?: number
): Promise<{ ok: true }> {
  return apiFetch(`curriculum/activities/${activityId}/attempt`, {
    method: "POST",
    body: JSON.stringify({ payload, score }),
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
  return apiFetch(
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
  return apiFetch(`curriculum/units/${unitId}/navigation${qs ? `?${qs}` : ""}`);
}
