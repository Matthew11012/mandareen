import { z } from "zod";
import { get, post, put, patch } from "../http/http";

// Validation schemas matching backend DTOs
export const registerSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username cannot exceed 30 characters")
    .transform((val) => val.trim())
    .refine(
      (val) => !/[\u0000-\u001f\u007f]/.test(val),
      "Username contains invalid characters"
    ),
});

export const loginSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// Type definitions
export type RegisterData = z.infer<typeof registerSchema>;
export type LoginData = z.infer<typeof loginSchema>;

export interface MeResponse {
  id: number;
  email: string;
  username: string;
  createdAt: string;
  currentLevel: number | null;
  weeklyGoalLessons: number | null;
}

export interface ApiError {
  message: string;
  statusCode?: number;
  error?: string;
}

// API service functions
export const authApi = {
  /**
   * Logout current user
   * @returns Promise with logout confirmation
   * @throws ApiError on server errors
   */
  logout: async (): Promise<{ message: string }> => {
    try {
      return post<{ message: string }>("auth/logout", {});
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get current authenticated user's profile
   */
  me: async (): Promise<MeResponse> => {
    return get<MeResponse>("users/me");
  },

  /**
   * Update weekly goal for lessons
   * @param weeklyGoalLessons Number of lessons (1-50) or null to unset
   * @returns Promise with updated weekly goal
   */
  updateWeeklyGoal: async (
    weeklyGoalLessons: number | null
  ): Promise<{ weeklyGoalLessons: number | null }> => {
    return put<{ weeklyGoalLessons: number | null }>("users/weekly-goal", {
      weeklyGoalLessons,
    });
  },

  /**
   * Update username
   * @returns Updated username
   * @throws 409 if username taken, 400 if invalid
   */
  updateUsername: async (username: string): Promise<{ username: string }> => {
    return patch<{ username: string }>("users/username", { username });
  },
};
