"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout";
import { dictionaryApi, type VocabItem } from "@/lib/api/dictionary";
import { getHSKPillClasses } from "@/lib/constants/hsk";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { AnimatePresence, motion } from "framer-motion";

export default function DictionaryPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<VocabItem[]>([]);
  const [selected, setSelected] = useState<VocabItem | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const [sort, setSort] = useState<"relevance" | "hsk" | "hanzi">("relevance");
  //   const [mineOnly] = useState(false); // placeholder for future filter
  const controllerRef = useRef<AbortController | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);

  // Debounced search with pagination state
  useEffect(() => {
    const id = setTimeout(async () => {
      if (!q.trim()) {
        setItems([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        controllerRef.current?.abort();
        controllerRef.current = new AbortController();
        const res = await dictionaryApi.search(q, { limit: 30 });
        const base = (res.items || []) as VocabItem[];
        const filtered = levels.length
          ? base.filter((r) =>
              r.hskLevel ? levels.includes(r.hskLevel) : false
            )
          : base;
        const sorted = [...filtered].sort((a, b) => {
          if (sort === "hsk") {
            const ah = (a.hskLevel ?? 999) as number;
            const bh = (b.hskLevel ?? 999) as number;
            if (ah !== bh) return ah - bh;
            const hc = (a.hanzi || "").localeCompare(b.hanzi || "");
            if (hc !== 0) return hc;
            return a.id - b.id;
          }
          if (sort === "hanzi") {
            const hc = (a.hanzi || "").localeCompare(b.hanzi || "");
            if (hc !== 0) return hc;
            return a.id - b.id;
          }
          const norm = (s?: string | null) => (s || "").toLowerCase();
          const qn = norm(q);
          const score = (v: VocabItem) => {
            const h = norm(v.hanzi);
            const p = norm(v.pinyin);
            const d = norm(v.definition);
            if (h === qn) return 1000;
            if (h.startsWith(qn)) return 800 - h.length;
            if (p === qn) return 700;
            if (p.startsWith(qn)) return 600 - p.length;
            if (h.includes(qn)) return 500 - h.length;
            if (p.includes(qn)) return 400 - p.length;
            if (d.includes(qn)) return 200 - Math.min(d.length, 200);
            return 0;
          };
          const sb = score(b) - score(a);
          if (sb !== 0) return sb;
          return a.id - b.id;
        });
        setItems(sorted);
        setNextCursor(res.nextCursor);
      } catch {
        setError("Failed to search");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [q, levels, sort]);

  const toggleLevel = (lvl: number) =>
    setLevels((prev) =>
      prev.includes(lvl) ? prev.filter((v) => v !== lvl) : [...prev, lvl]
    );

  const countText = useMemo(() => {
    if (loading) return "Searching…";
    if (error) return error;
    return items.length ? `${items.length} results` : "No results";
  }, [loading, error, items.length]);

  return (
    <DashboardLayout
      title="Dictionary"
      subtitle="Search words across your lessons and cedict"
    >
      <div ref={containerRef} className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索… / pinyin… / english…"
            className="w-full sm:w-[420px] px-3 py-2 rounded-lg bg-[#2e323a] border border-[#404040] text-white placeholder:text-[#8a8f99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2]"
            aria-label="Search dictionary"
          />
          <div
            className="flex items-center flex-wrap gap-2"
            role="group"
            aria-label="Filter by HSK level"
          >
            {[1, 2, 3, 4, 5, 6, 7].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => toggleLevel(lvl)}
                className={`px-2 py-1 text-xs rounded-full cursor-pointer ${
                  levels.includes(lvl)
                    ? getHSKPillClasses(lvl)
                    : "border border-[#404040] text-[#a6a6a6]"
                }`}
                aria-pressed={levels.includes(lvl)}
              >
                HSK {lvl}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto text-xs text-[#a6a6a6]">
            <div className="min-w-[160px]">
              <Select
                value={sort}
                onValueChange={(v) =>
                  setSort(v as "relevance" | "hsk" | "hanzi")
                }
              >
                <SelectTrigger className="w-full bg-[#2e323a] border-[#404040] text-[#c9d1d9] focus:ring-[#4040f2]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent className="bg-[#2e323a] border-[#404040] text-[#c9d1d9]">
                  <SelectItem value="relevance">Relevance</SelectItem>
                  <SelectItem value="hsk">HSK</SelectItem>
                  <SelectItem value="hanzi">Hanzi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span aria-live="polite">{countText}</span>
          </div>
        </div>

        <div
          ref={listRef}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          style={{ overflowAnchor: "none" }}
        >
          {loading && q.trim() ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[96px] rounded-lg bg-[#2e323a] border border-[#404040] animate-pulse"
              />
            ))
          ) : items.length === 0 && q.trim() ? (
            <div className="text-[#a6a6a6]">No results</div>
          ) : (
            <AnimatePresence initial={false}>
              {items.map((v, idx) => (
                <motion.button
                  key={v.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 24,
                    mass: 0.5,
                    bounce: 0.2,
                    delay: Math.min(idx * 0.01, 0.08),
                  }}
                  className="text-left p-3 rounded-lg bg-[#2e323a] border border-[#404040] hover:border-[#4040f2] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2]"
                  onClick={() => setSelected(v)}
                  title={v.definition || undefined}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold truncate">
                      {v.hanzi}
                    </div>
                    {typeof v.hskLevel === "number" && (
                      <span
                        className={`text-[10px] leading-none px-2 py-[2px] rounded-full ${getHSKPillClasses(v.hskLevel)}`}
                      >
                        HSK {v.hskLevel}
                      </span>
                    )}
                  </div>
                  {v.pinyin ? (
                    <div className="text-[#9aa6ff] text-xs mt-1">
                      {v.pinyin}
                    </div>
                  ) : null}
                  {v.definition ? (
                    <div
                      className="text-[#a6a6a6] text-sm mt-1 truncate"
                      title={v.definition || undefined}
                    >
                      {v.definition}
                    </div>
                  ) : null}
                </motion.button>
              ))}
            </AnimatePresence>
          )}
        </div>

        {loadMoreLoading && q.trim() && items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`lm-skel-${i}`}
                className="h-[96px] rounded-lg bg-[#2e323a] border border-[#404040] animate-pulse"
              />
            ))}
          </div>
        )}

        <div className="h-12 flex justify-center mt-4">
          {nextCursor && q.trim() && items.length > 0 && (
            <button
              className={`w-[140px] px-3 py-2 text-sm rounded-lg border ${
                loadMoreLoading
                  ? "border-[#404040] opacity-70"
                  : "border-[#404040] hover:border-[#4040f2]"
              } text-[#a6a6a6] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2]`}
              disabled={loadMoreLoading}
              onClick={async () => {
                const scrollEl = containerRef.current?.closest("main");
                const beforeTop =
                  (scrollEl as HTMLElement | null)?.scrollTop ?? 0;
                const next = nextCursor;
                if (!next) return;
                setLoadMoreLoading(true);
                try {
                  const res = await dictionaryApi.search(q, {
                    limit: 30,
                    cursor: next,
                  });
                  const nextPage = (res.items || []) as VocabItem[];
                  const filteredNext: VocabItem[] = levels.length
                    ? nextPage.filter((r) =>
                        r.hskLevel ? levels.includes(r.hskLevel) : false
                      )
                    : nextPage;
                  // Sort only the new page; do not resort previously loaded items to avoid reshuffle
                  const sortedNext = [...filteredNext].sort((a, b) => {
                    if (sort === "hsk") {
                      const ah = (a.hskLevel ?? 999) as number;
                      const bh = (b.hskLevel ?? 999) as number;
                      if (ah !== bh) return ah - bh;
                      const hc = (a.hanzi || "").localeCompare(b.hanzi || "");
                      if (hc !== 0) return hc;
                      return a.id - b.id;
                    }
                    if (sort === "hanzi") {
                      const hc = (a.hanzi || "").localeCompare(b.hanzi || "");
                      if (hc !== 0) return hc;
                      return a.id - b.id;
                    }
                    const norm = (s?: string | null) => (s || "").toLowerCase();
                    const qn = norm(q);
                    const score = (v: VocabItem) => {
                      const h = norm(v.hanzi);
                      const p = norm(v.pinyin);
                      const d = norm(v.definition);
                      if (h === qn) return 1000;
                      if (h.startsWith(qn)) return 800 - h.length;
                      if (p === qn) return 700;
                      if (p.startsWith(qn)) return 600 - p.length;
                      if (h.includes(qn)) return 500 - h.length;
                      if (p.includes(qn)) return 400 - p.length;
                      if (d.includes(qn)) return 200 - Math.min(d.length, 200);
                      return 0;
                    };
                    const sb = score(b) - score(a);
                    if (sb !== 0) return sb;
                    return a.id - b.id;
                  });
                  setItems([...items, ...sortedNext]);
                  setNextCursor(res.nextCursor);
                  // Preserve scroll position in the scroll container
                  if (scrollEl) {
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        (scrollEl as HTMLElement).scrollTop = beforeTop;
                      });
                    });
                  }
                } finally {
                  setLoadMoreLoading(false);
                }
              }}
            >
              Load more
            </button>
          )}
        </div>

        <AnimatePresence>
          {selected && (
            <div className="fixed inset-0 z-30" role="dialog" aria-modal="true">
              <motion.div
                className="absolute inset-0 bg-black/50"
                onClick={() => setSelected(null)}
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              />
              <motion.div
                className="absolute right-0 top-0 h-full w-full sm:w-[480px] bg-[#1f242c] border-l border-[#30333a] p-4 overflow-y-auto"
                initial={{ x: 24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 24, opacity: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 28,
                  mass: 0.6,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-white text-2xl font-bold truncate">
                    {selected.hanzi}
                  </div>
                  {typeof selected.hskLevel === "number" && (
                    <span
                      className={`text-[11px] leading-none px-2 py-[3px] rounded-full ${getHSKPillClasses(selected.hskLevel)}`}
                    >
                      HSK {selected.hskLevel}
                    </span>
                  )}
                </div>
                {selected.pinyin ? (
                  <div className="text-[#9aa6ff] mt-1">{selected.pinyin}</div>
                ) : null}
                {/* Lazy-load senses/details on open */}
                {!Array.isArray(selected.senses) && (
                  <LoadSenses
                    hanzi={selected.hanzi}
                    onData={(full) =>
                      setSelected((prev) =>
                        prev && prev.hanzi === full.hanzi
                          ? { ...prev, ...full }
                          : prev
                      )
                    }
                  />
                )}
                {selected.definition ? (
                  <div className="text-[#c9d1d9] mt-3 whitespace-pre-wrap">
                    {selected.definition}
                  </div>
                ) : null}
                {Array.isArray(selected.senses) &&
                  selected.senses.length > 0 && (
                    <div className="mt-4">
                      <div className="text-[#8a8f99] text-xs uppercase tracking-wide mb-2">
                        Other meanings
                      </div>
                      <ul className="space-y-2">
                        {selected.senses
                          .filter((s) => {
                            const def = (s.definition || "").trim();
                            const mainDef = (selected.definition || "").trim();
                            const pin = (s.pinyin || "").trim().toLowerCase();
                            const mainPin = (selected.pinyin || "")
                              .trim()
                              .toLowerCase();
                            // exclude the main sense if duplicated
                            if (
                              def &&
                              def === mainDef &&
                              (!pin || pin === mainPin)
                            )
                              return false;
                            return true;
                          })
                          .map((s) => (
                            <li
                              key={s.id}
                              className="border border-[#2a2e36] rounded p-2 bg-[#171b21]"
                            >
                              {s.pinyin ? (
                                <div className="text-[#9aa6ff] text-xs mb-1">
                                  {s.pinyin}
                                </div>
                              ) : null}
                              <div className="text-[#c9d1d9] text-sm whitespace-pre-wrap">
                                {s.definition}
                              </div>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setSelected(null)}
                    className="px-3 py-2 text-sm rounded-lg border border-[#404040] text-[#a6a6a6] hover:border-[#4040f2] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2]"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}

function LoadSenses({
  hanzi,
  onData,
}: {
  hanzi: string;
  onData: (item: VocabItem) => void;
}) {
  const [once, setOnce] = useState(false);
  useEffect(() => {
    if (once) return;
    let cancelled = false;
    (async () => {
      try {
        const full = await dictionaryApi.lookup(hanzi);
        if (!cancelled && full) {
          onData(full);
          setOnce(true);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hanzi, once, onData]);
  return null;
}
