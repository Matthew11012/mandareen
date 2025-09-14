import axios from "axios";
import type {
  AssessmentPassage,
  AssessmentSubmission,
} from "../types/assessment";

// Create axios instance with base configuration
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor to include auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth-token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const assessmentApi = {
  /**
   * Fetch assessment questions/passages from the backend
   */
  async getQuestions(): Promise<AssessmentPassage[]> {
    try {
      const response = await api.get<AssessmentPassage[]>("/assess/questions");
      return response.data;
    } catch (error) {
      console.error("Error fetching assessment questions:", error);
      throw new Error("Failed to fetch assessment questions");
    }
  },

  /**
   * Submit assessment responses to calculate placement level
   */
  async submitAssessment(
    submission: AssessmentSubmission
  ): Promise<{ levelPlaced: number }> {
    try {
      const response = await api.post<{ levelPlaced: number }>(
        "/assess/submit",
        submission
      );
      return response.data;
    } catch (error) {
      console.error("Error submitting assessment:", error);
      throw new Error("Failed to submit assessment");
    }
  },

  /**
   * Get assessment history
   */
  async getHistory(): Promise<
    Array<{ id: number; levelPlaced: number; takenAt: string }>
  > {
    try {
      const response = await api.get("/assess/history");
      return response.data;
    } catch (error) {
      console.error("Error fetching assessment history:", error);
      throw new Error("Failed to fetch assessment history");
    }
  },

  /**
   * Get user's current HSK level from latest assessment
   */
  async getCurrentLevel(): Promise<{ currentLevel: number | null }> {
    try {
      const response = await api.get<{ currentLevel: number | null }>(
        "/assess/current-level"
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching current level:", error);
      throw new Error("Failed to fetch current level");
    }
  },
};
