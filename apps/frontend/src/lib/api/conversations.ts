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
}

export const conversationsApi = {
  async start(): Promise<{ id: number }> {
    const res = await api.post<{ id: number }>("/conversations", {});
    return res.data;
  },

  async listMessages(id: number): Promise<Message[]> {
    const res = await api.get<Message[]>(`/conversations/${id}/messages`);
    return res.data;
  },

  async send(
    id: number,
    hanzi: string
  ): Promise<{ user: Message; ai: Message }> {
    const res = await api.post<{ user: Message; ai: Message }>(
      `/conversations/${id}/messages`,
      { hanzi }
    );
    return res.data;
  },
};
