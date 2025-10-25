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
    opts?: { limit?: number; cursor?: string; hsk?: number[]; exact?: boolean }
  ): Promise<{
    pinned?: VocabItem[];
    items: VocabItem[];
    nextCursor?: string;
  }> {
    if (!query || !query.trim()) return { items: [] };
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.hsk && opts.hsk.length > 0) {
      // Append multiple hsk params for server parsing
      for (const lvl of opts.hsk) {
        if (typeof lvl === "number" && Number.isFinite(lvl)) {
          params.append("hsk", String(lvl));
        }
      }
    }
    if (opts?.exact) params.set("exact", "1");
    const qs = params.toString();
    return get<{
      pinned?: VocabItem[];
      items: VocabItem[];
      nextCursor?: string;
    }>(`vocabulary/search/${encodeURIComponent(query)}${qs ? `?${qs}` : ""}`);
  },
  async lookup(hanzi: string): Promise<VocabItem | null> {
    return post<VocabItem>(`vocabulary/lookup`, { hanzi });
  },
};
