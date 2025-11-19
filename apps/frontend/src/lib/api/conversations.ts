import { get, post, del } from "../http/http";

export interface MessageNotes {
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
}

export interface Message {
  id: number;
  role: "user" | "ai";
  hanzi: string;
  pinyin: string;
  translation: string;
  createdAt: string;
  audioUrl?: string;
  notes?: MessageNotes;
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
  // Loading flags for progressive SSE events
  _loadingPinyin?: boolean;
  _loadingTranslation?: boolean;
  _loadingAudio?: boolean;
  _loadingNotes?: boolean;
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
    // Build absolute backend URL to avoid Next.js proxy buffering and ensure cookies are sent
    const rawBase =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:3000";
    const trimmed = rawBase.replace(/\/$/, "");
    const apiBase = trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
    return `${apiBase}/conversations/${id}/stream?${params.toString()}`;
  },

  async delete(id: number): Promise<{ deleted: boolean }> {
    return del<{ deleted: boolean }>(`conversations/${id}`);
  },

  async generateManualNotes(
    conversationId: number,
    messageId: number
  ): Promise<{ ok: true; notes: MessageNotes }> {
    return post<{ ok: true; notes: MessageNotes }>(
      `conversations/${conversationId}/messages/${messageId}/generate-notes`,
      {},
      {
        // Increase timeout to 120 seconds since note generation can take longer
        timeoutMs: 120000,
      }
    );
  },
};
