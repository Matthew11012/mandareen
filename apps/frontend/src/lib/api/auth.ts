import axios from "axios";
import { z } from "zod";

// Base API configuration
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

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
      const response = await api.post<AuthResponse>(
        "/auth/register",
        validatedData
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiError: ApiError = {
          message: error.response?.data?.message || "Registration failed",
          statusCode: error.response?.status,
          error: error.response?.data?.error,
        };
        throw apiError;
      }
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
      const response = await api.post<AuthResponse>(
        "/auth/login",
        validatedData
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiError: ApiError = {
          message: error.response?.data?.message || "Login failed",
          statusCode: error.response?.status,
          error: error.response?.data?.error,
        };
        throw apiError;
      }
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
      const response = await api.post<{ message: string }>("/auth/logout");
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiError: ApiError = {
          message: error.response?.data?.message || "Logout failed",
          statusCode: error.response?.status,
          error: error.response?.data?.error,
        };
        throw apiError;
      }
      throw error;
    }
  },

  /**
   * Get current authenticated user's profile
   */
  me: async (): Promise<MeResponse> => {
    const response = await api.get<MeResponse>("/users/me");
    return response.data;
  },

  /**
   * Initiate Google OAuth flow
   * @returns Google OAuth URL for redirection
   */
  getGoogleAuthUrl: (): string => {
    const baseUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";
    return `${baseUrl}/auth/google`;
  },
};

// Axios request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth-token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Axios response interceptor for auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear invalid token and redirect to login
      localStorage.removeItem("auth-token");
      window.location.href = "/auth/login";
    }
    return Promise.reject(error);
  }
);

export default api;
