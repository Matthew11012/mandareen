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

const base = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"
).replace(/\/$/, "");

export const dictionaryApi = {
  async search(
    query: string,
    opts?: { limit?: number; cursor?: string }
  ): Promise<{ items: VocabItem[]; nextCursor?: string }> {
    if (!query || !query.trim()) return { items: [] };
    const token =
      typeof window !== "undefined" ? localStorage.getItem("auth-token") : null;
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.cursor) params.set("cursor", opts.cursor);
    const qs = params.toString();
    const res = await fetch(
      `${base}/vocabulary/search/${encodeURIComponent(query)}${qs ? `?${qs}` : ""}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }
    );
    if (!res.ok) throw new Error("Failed to search vocabulary");
    return (await res.json()) as { items: VocabItem[]; nextCursor?: string };
  },
  async lookup(hanzi: string): Promise<VocabItem | null> {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("auth-token") : null;
    const res = await fetch(`${base}/vocabulary/lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ hanzi }),
    });
    if (!res.ok) throw new Error("Failed to lookup word");
    return (await res.json()) as VocabItem;
  },
};
