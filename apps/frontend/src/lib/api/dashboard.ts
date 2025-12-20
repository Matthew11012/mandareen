import { get } from "../http/http";

export interface DashboardOverview {
  assessmentHistory: Array<{
    id: number;
    levelPlaced: number;
    takenAt: string;
  }>;
  lessonsCount: { finishedCount: number };
  streakStatus: {
    todayContinued: boolean;
    streakDays: number;
    carryOverDays: number;
    lastActivityLocalDate: string | null;
  };
  wordsRead: { readCount: number };
  units: Array<{
    id: number;
    title: string;
    description?: string | null;
    totalLessons: number;
    completedLessons: number;
  }>;
  currentLevel: { currentLevel: number | null };
  weeklyProgress: {
    weeklyCount: number;
    weekStartLocalISO: string;
    weekEndLocalISO: string;
  };
  me: {
    id: number;
    email: string;
    username: string;
    createdAt: string;
    currentLevel: number | null;
    weeklyGoalLessons: number | null;
  };
  flashcardsSummary: {
    total: number;
    due: number;
  };
}

export const dashboardApi = {
  async overview(): Promise<DashboardOverview> {
    return get<DashboardOverview>("dashboard/overview");
  },
};
