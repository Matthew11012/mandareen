import { cookies } from "next/headers";

function normalizeApiBase(): string {
  const rawBase =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";
  const trimmed = rawBase.replace(/\/$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

export async function serverApiFetch(path: string, init?: RequestInit) {
  const base = normalizeApiBase();
  const url = `${base}/${path}`.replace(/([^:]\/)\/+/g, "$1");

  const cookieStore = await cookies();
  const legacyToken = cookieStore.get("auth-token")?.value;
  // Better Auth cookies may be prefixed with __Secure- and use dots/underscores.
  const betterAuthCookies = cookieStore.getAll().filter((cookie) => {
    const name = cookie.name;
    return (
      name.startsWith("mandareen") || name.startsWith("__Secure-mandareen")
    );
  });

  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (legacyToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${legacyToken}`);
  }
  if (betterAuthCookies.length > 0) {
    const cookieHeader = betterAuthCookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    headers.append("Cookie", cookieHeader);
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
    cache: init?.cache ?? "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text}`);
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

// Domain-specific server helpers used by the dashboard server component
export async function serverGetAssessmentHistory(): Promise<
  Array<{ id: number; levelPlaced: number; takenAt: string }>
> {
  return serverApiFetch("assess/history");
}

export async function serverGetLessonsProgressCount(): Promise<{
  finishedCount: number;
}> {
  return serverApiFetch("lessons/progress/count");
}

export async function serverGetWordsRead(): Promise<{ readCount: number }> {
  return serverApiFetch("lessons/progress/words-read");
}

export async function serverGetCurrentLevel(): Promise<{
  currentLevel: number | null;
}> {
  return serverApiFetch("assess/current-level");
}

export async function serverGetStudyStreak(offsetMinutes?: number): Promise<{
  streakDays: number;
}> {
  const qs = new URLSearchParams();
  if (typeof offsetMinutes === "number") {
    qs.set("offsetMinutes", String(offsetMinutes));
  }
  const path =
    qs.size > 0
      ? `lessons/progress/streak?${qs.toString()}`
      : "lessons/progress/streak";
  return serverApiFetch(path);
}

export async function serverGetStudyStreakStatus(
  offsetMinutes?: number
): Promise<{
  todayContinued: boolean;
  streakDays: number;
  carryOverDays: number;
  lastActivityLocalDate: string | null;
}> {
  const qs = new URLSearchParams();
  if (typeof offsetMinutes === "number") {
    qs.set("offsetMinutes", String(offsetMinutes));
  }
  const path =
    qs.size > 0
      ? `lessons/progress/streak-status?${qs.toString()}`
      : "lessons/progress/streak-status";
  return serverApiFetch(path);
}

export type ServerCurriculumUnit = {
  id: number;
  title: string;
  description?: string | null;
  totalLessons: number;
  completedLessons: number;
};

export type ServerCurriculumLesson = {
  id: number;
  title: string;
  description?: string | null;
  order: number;
  completed?: boolean;
};

export async function serverListUnits(): Promise<ServerCurriculumUnit[]> {
  return serverApiFetch("curriculum/units");
}

export async function serverGetUnit(unitId: number): Promise<{
  id: number;
  title: string;
  description?: string | null;
  lessons: ServerCurriculumLesson[];
}> {
  return serverApiFetch(`curriculum/units/${unitId}`);
}

export async function serverGetWeeklyProgress(offsetMinutes?: number): Promise<{
  weeklyCount: number;
  weekStartLocalISO: string;
  weekEndLocalISO: string;
}> {
  const qs = new URLSearchParams();
  if (typeof offsetMinutes === "number") {
    qs.set("offsetMinutes", String(offsetMinutes));
  }
  const path =
    qs.size > 0
      ? `lessons/progress/weekly?${qs.toString()}`
      : "lessons/progress/weekly";
  return serverApiFetch(path);
}

export async function serverGetMe(): Promise<{
  id: number;
  email: string;
  createdAt: string;
  currentLevel: number | null;
  weeklyGoalLessons: number | null;
}> {
  return serverApiFetch("users/me");
}

export async function serverGetFlashcardsSummary(): Promise<{
  total: number;
  due: number;
  dueToday: number;
  notStudied: number;
  weak: number;
  partial: number;
  strong: number;
}> {
  return serverApiFetch("flashcards/summary");
}
