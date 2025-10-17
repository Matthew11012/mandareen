import { get, post } from "../http/http";

export interface Message {
  id: number;
  role: "user" | "ai";
  hanzi: string;
  pinyin: string;
  translation: string;
  createdAt: string;
  audioUrl?: string;
  notes?: {
    grammarNotes?: Array<{
      point: string;
      brief: string;
      sources?: Array<{ key?: string; chunkId?: number }>;
      pointPinyin?: string;
      pointEn?: string;
      briefPinyin?: string;
      briefEn?: string;
      examples?: Array<{ zh: string; en?: string; pinyin?: string }>;
    }>;
    tips?: string[];
    tipsRich?: Array<{ zh: string; pinyin?: string; en?: string }>;
    citations?: Array<{ key?: string; chunkId?: number }>;
  };
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
    return get<ConversationSummary[]>("conversations");
  },
  async start(): Promise<{ id: number }> {
    return post<{ id: number }>("conversations", {});
  },

  async listMessages(id: number): Promise<Message[]> {
    return get<Message[]>(`conversations/${id}/messages`);
  },

  async send(id: number, hanzi: string): Promise<{ user: Message }> {
    return post<{ user: Message }>(`conversations/${id}/messages`, { hanzi });
  },
  async sendAudio(id: number, audio: Blob): Promise<{ user: Message }> {
    const form = new FormData();
    form.append("audio", audio, "input.webm");
    const url = `/api/conversations/${id}/audio`;
    const res = await fetch(url, {
      method: "POST",
      // Same-origin: cookies sent automatically
      credentials: "include",
      body: form,
    });
    if (!res.ok) throw new Error("Audio upload failed");
    return res.json();
  },
  streamUrl(id: number, hanzi: string): string {
    const params = new URLSearchParams();
    if (hanzi) params.set("hanzi", hanzi);
    // Same-origin SSE so httpOnly cookie is sent; no token appended
    return `/api/conversations/${id}/stream?${params.toString()}`;
  },
};
