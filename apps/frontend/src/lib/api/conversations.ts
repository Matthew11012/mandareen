import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth-token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface Message {
  id: number;
  role: "user" | "ai";
  hanzi: string;
  pinyin: string;
  translation: string;
  createdAt: string;
  segments?: Array<{
    text: string;
    startIndex: number;
    endIndex: number;
    isWord: boolean;
    hskLevel?: number;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
  }>;
}

export interface ConversationSummary {
  id: number;
  startedAt: string;
}

export const conversationsApi = {
  async list(): Promise<ConversationSummary[]> {
    const res = await api.get<ConversationSummary[]>("/conversations");
    return res.data;
  },
  async start(): Promise<{ id: number }> {
    const res = await api.post<{ id: number }>("/conversations", {});
    return res.data;
  },

  async listMessages(id: number): Promise<Message[]> {
    const res = await api.get<Message[]>(`/conversations/${id}/messages`);
    return res.data;
  },

  async send(id: number, hanzi: string): Promise<{ user: Message }> {
    const res = await api.post<{ user: Message }>(
      `/conversations/${id}/messages`,
      { hanzi }
    );
    return res.data;
  },
  streamUrl(id: number, hanzi: string): string {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";
    const token =
      typeof window !== "undefined" ? localStorage.getItem("auth-token") : null;
    const url = new URL(`${base}/conversations/${id}/stream`);
    if (token) url.searchParams.set("token", token);
    if (hanzi) url.searchParams.set("hanzi", hanzi);
    // For SSE with body-less GET; we already POSTed user message with send().
    return url.toString();
  },
};
