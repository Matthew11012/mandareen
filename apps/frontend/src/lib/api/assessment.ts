import type {
  AssessmentPassage,
  AssessmentSubmission,
} from "../types/assessment";
import { get, post } from "../http/http";

export const assessmentApi = {
  /**
   * Fetch assessment questions/passages from the backend
   */
  async getQuestions(): Promise<AssessmentPassage[]> {
    return get<AssessmentPassage[]>("assess/questions");
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
