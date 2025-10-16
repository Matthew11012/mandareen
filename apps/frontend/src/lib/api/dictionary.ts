export type VocabItem = {
  id: number;
  hanzi: string;
  traditional?: string | null;
  pinyin?: string | null;
  definition?: string | null;
  hskLevel?: number | null;
  isCustom?: boolean | null;
  senses?: Array<{
    id: number;
    pinyin?: string | null;
    definition?: string | null;
  }>;
};

import { get, post } from "../http/http";

export const dictionaryApi = {
  async search(
    query: string,
    opts?: { limit?: number; cursor?: string }
  ): Promise<{ items: VocabItem[]; nextCursor?: string }> {
    if (!query || !query.trim()) return { items: [] };
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.cursor) params.set("cursor", opts.cursor);
    const qs = params.toString();
    return get<{ items: VocabItem[]; nextCursor?: string }>(
      `vocabulary/search/${encodeURIComponent(query)}${qs ? `?${qs}` : ""}`
    );
  },
  async lookup(hanzi: string): Promise<VocabItem | null> {
    return post<VocabItem>(`vocabulary/lookup`, { hanzi });
  },
};
