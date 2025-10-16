import { z } from "zod";
import { get, post } from "../http/http";

const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

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
});

export const loginSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// Type definitions
export type RegisterData = z.infer<typeof registerSchema>;
export type LoginData = z.infer<typeof loginSchema>;

export interface AuthResponse {
  user: {
    id: number;
    email: string;
  };
  token: string;
}

export interface MeResponse {
  id: number;
  email: string;
  createdAt: string;
  currentLevel: number | null;
}

export interface ApiError {
  message: string;
  statusCode?: number;
  error?: string;
}

// API service functions
export const authApi = {
  /**
   * Register a new user account
   * @param data User registration data (email, password)
   * @returns Promise with user data and JWT token
   * @throws ApiError on validation failures or server errors
   */
  register: async (data: RegisterData): Promise<AuthResponse> => {
    try {
      const validatedData = registerSchema.parse(data);
      return post<AuthResponse>("auth/register", validatedData);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Login with email and password
   * @param data User login credentials
   * @returns Promise with user data and JWT token
   * @throws ApiError on invalid credentials or server errors
   */
  login: async (data: LoginData): Promise<AuthResponse> => {
    try {
      const validatedData = loginSchema.parse(data);
      return post<AuthResponse>("auth/login", validatedData);
    } catch (error) {
      throw error;
    }
  },

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
   * Initiate Google OAuth flow
   * @returns Google OAuth URL for redirection
   */
  getGoogleAuthUrl: (): string => {
    return `${baseUrl}/auth/google`;
  },
};
