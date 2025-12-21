import type {
  AssessmentPassage,
  AssessmentSubmission,
} from "../types/assessment";
import { get, post } from "../http/http";

export const assessmentApi = {
  /**
   * Fetch assessment questions/passages from the backend
   */
  async getQuestions(
    params?: { maxLevel?: number; passageCount?: number },
    opts?: { timeoutMs?: number }
  ): Promise<AssessmentPassage[]> {
    const searchParams = new URLSearchParams();
    if (params?.maxLevel) searchParams.set("maxLevel", String(params.maxLevel));
    if (params?.passageCount)
      searchParams.set("passageCount", String(params.passageCount));
    const qs = searchParams.toString();
    const path = qs ? `assess/questions?${qs}` : "assess/questions";
    return get<AssessmentPassage[]>(path, { timeoutMs: opts?.timeoutMs });
  },

  /**
   * Submit assessment responses to calculate placement level
   */
  async submitAssessment(
    submission: AssessmentSubmission
  ): Promise<{ levelPlaced: number }> {
    return post<{ levelPlaced: number }>("assess/submit", submission);
  },

  /**
   * Get assessment history
   */
  async getHistory(): Promise<
    Array<{ id: number; levelPlaced: number; takenAt: string }>
  > {
    return get<Array<{ id: number; levelPlaced: number; takenAt: string }>>(
      "assess/history"
    );
  },

  /**
   * Get user's current HSK level from latest assessment
   */
  async getCurrentLevel(): Promise<{ currentLevel: number | null }> {
    return get<{ currentLevel: number | null }>("assess/current-level");
  },
};
