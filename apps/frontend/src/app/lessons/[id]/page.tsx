"use client";

import {
  useEffect,
  useMemo,
  useState,
  useRef,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/layout";
import { lessonsApi, type LessonDetail } from "@/lib/api/lessons";
import {
  Eye,
  EyeOff,
  RefreshCw,
  ArrowLeft,
  Plus,
  CheckSquare,
  Square,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
// import { flashcardsApi } from "@/lib/api/flashcards";

export default function LessonViewerPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params?.id);
  const [data, setData] = useState<LessonDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showPinyin, setShowPinyin] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [chunkPinyinOn, setChunkPinyinOn] = useState<
    Record<number, boolean | null>
  >({});
  const [chunkTransOn, setChunkTransOn] = useState<
    Record<number, boolean | null>
  >({});
  const [turnPinyinOn, setTurnPinyinOn] = useState<
    Record<number, boolean | null>
  >({});
  const [turnTransOn, setTurnTransOn] = useState<
    Record<number, boolean | null>
  >({});
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedWords, setSelectedWords] = useState<
    Record<
      string,
      { text: string; pinyin?: string; paraIndex?: number; tokenIndex?: number }
    >
  >({});

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await lessonsApi.getById(id);
      setData(detail);
    } catch {
      setError("Failed to load lesson");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const storySection = useMemo(
    () => data?.sections.find((s) => s.sectionType === "story"),
    [data]
  );
  type LessonToken = {
    text: string;
    isWord?: boolean;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
  };
  const story = storySection?.content as
    | {
        title?: string | null;
        titlePinyin?: string | null;
        titleTranslation?: string | null;
        hanzi: string;
        pinyin?: string;
        translation?: string;
        segments?: LessonToken[];
      }
    | undefined;

  const dialogueSection = useMemo(
    () => data?.sections.find((s) => s.sectionType === "dialogue"),
    [data]
  );
  const dialogue = dialogueSection?.content as
    | {
        title?: string | null;
        titlePinyin?: string | null;
        titleTranslation?: string | null;
        turns?: Array<{
          speaker: string;
          hanzi: string;
          pinyin?: string;
          translation?: string;
          segments?: LessonToken[];
        }>;
      }
    | undefined;

  // Popup for token details
  const [popup, setPopup] = useState<{
    open: boolean;
    x: number;
    y: number;
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    paraIndex?: number;
    tokenIndex?: number;
  }>({ open: false, x: 0, y: 0, word: "" });
  const popupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopup((p) => ({ ...p, open: false }));
      }
    };
    if (popup.open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [popup.open]);

  const isChunkPinyinOn = (idx: number) => {
    const v = chunkPinyinOn[idx];
    if (v === true) return true;
    if (v === false) return false;
    return showPinyin;
  };
  const isChunkTransOn = (idx: number) => {
    const v = chunkTransOn[idx];
    if (v === true) return true;
    if (v === false) return false;
    return showTranslation;
  };
  const isTurnPinyinOn = (idx: number) => {
    const v = turnPinyinOn[idx];
    if (v === true) return true;
    if (v === false) return false;
    return showPinyin;
  };
  const isTurnTransOn = (idx: number) => {
    const v = turnTransOn[idx];
    if (v === true) return true;
    if (v === false) return false;
    return showTranslation;
  };

  const toggleSelectWord = (
    key: string,
    text: string,
    pinyin: string | undefined,
    paraIndex: number,
    tokenIndex: number
  ) => {
    setSelectedWords((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = { text, pinyin, paraIndex, tokenIndex };
      return next;
    });
  };

  const addSingleToFlashcards = async (
    hanzi: string,
    context?: { hanzi?: string; pinyin?: string; translation?: string }
  ) => {
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"}/flashcards`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${
              typeof window !== "undefined"
                ? localStorage.getItem("auth-token")
                : ""
            }`,
          },
          body: JSON.stringify({
            hanzi,
            sentenceHanzi: context?.hanzi,
            sentencePinyin: context?.pinyin,
            sentenceTranslation: context?.translation,
          }),
        }
      );
      toast.success("Added to flashcards");
    } catch {
      toast.error("Failed to add to flashcards");
    }
  };

  const addSelectedToFlashcards = async () => {
    const entries = Object.values(selectedWords);
    if (entries.length === 0) return;
    try {
      for (const w of entries) {
        let sentenceCtx:
          | { hanzi?: string; pinyin?: string; translation?: string }
          | undefined;
        if (
          typeof w.paraIndex === "number" &&
          typeof w.tokenIndex === "number"
        ) {
          const paraIndex = w.paraIndex;
          const paraHanzi = storyParagraphs[paraIndex] || "";
          const hanziSentences = paraHanzi
            .split(/(?<=[。！？!?])/)
            .map((s) => s.trim())
            .filter(Boolean);
          // compute token start offset within paragraph
          const tokens = segmentedParagraphs[paraIndex] || [];
          const tokenStart = tokens
            .slice(0, w.tokenIndex)
            .reduce((acc, s) => acc + (s.text?.length || 0), 0);
          // find sentence by char range
          let accLen = 0;
          let chosenIdx = 0;
          for (let si = 0; si < hanziSentences.length; si++) {
            const sTxt = hanziSentences[si];
            const sLen = sTxt.length;
            if (tokenStart >= accLen && tokenStart < accLen + sLen) {
              chosenIdx = si;
              break;
            }
            accLen += sLen;
          }
          const chosenHanzi = hanziSentences[chosenIdx] || paraHanzi;
          // build per-char pinyin string from tokens
          const perChar: string[] = [];
          // walk chars within paragraph and map to tokens
          let tokenPos = 0;
          let tokenCharIndex = 0;
          const paraChars = Array.from(paraHanzi);
          const sentStart = hanziSentences.slice(0, chosenIdx).join("").length;
          const sentLen = (hanziSentences[chosenIdx] || "").length;
          for (let i = 0; i < paraChars.length; i++) {
            // advance token positions
            while (
              tokenPos < tokens.length &&
              tokenCharIndex >= (tokens[tokenPos].text?.length || 0)
            ) {
              tokenPos++;
              tokenCharIndex = 0;
            }
            const token = tokens[tokenPos];
            let p = "";
            if (token && token.isWord && token.pinyin) {
              const splits = token.pinyin.split(/\s+/);
              p = splits[tokenCharIndex] || splits[0] || "";
            }
            // if char within chosen sentence range, record pinyin
            if (i >= sentStart && i < sentStart + sentLen) {
              perChar.push(p);
            }
            tokenCharIndex++;
          }
          // align translation by index best-effort
          const paraTrans = translationParagraphs[paraIndex] || "";
          const transSentences = paraTrans
            .split(/(?<=[.!?])\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
          sentenceCtx = {
            hanzi: chosenHanzi,
            pinyin: perChar.join(" "),
            translation: transSentences[chosenIdx],
          };
        }
        await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"}/flashcards`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${
                typeof window !== "undefined"
                  ? localStorage.getItem("auth-token")
                  : ""
              }`,
            },
            body: JSON.stringify({
              hanzi: w.text,
              sentenceHanzi: sentenceCtx?.hanzi,
              sentencePinyin: sentenceCtx?.pinyin,
              sentenceTranslation: sentenceCtx?.translation,
            }),
          }
        );
      }
      setSelectedWords({});
      setMultiSelect(false);
      toast.success("Added selected words to flashcards");
    } catch {
      toast.error("Failed to add selected words");
    }
  };

  const storyParagraphs = useMemo(
    () =>
      (story?.hanzi || "")
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [story?.hanzi]
  );
  const translationParagraphs = useMemo(
    () =>
      (story?.translation || "")
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [story?.translation]
  );

  const segmentedParagraphs: LessonToken[][] = useMemo(() => {
    if (!story || !Array.isArray(story.segments) || story.segments.length === 0)
      return [];
    const result: LessonToken[][] = [];
    let cursor = 0;
    for (const para of storyParagraphs) {
      const paraEnd = cursor + para.length;
      const bucket: LessonToken[] = [];
      // inline compute segment cumulative indices
      let idxAcc = 0;
      for (const seg of story.segments) {
        const start = idxAcc;
        const end = start + seg.text.length;
        if (start >= cursor && end <= paraEnd) {
          bucket.push(seg);
        }
        idxAcc = end;
      }
      result.push(bucket);
      cursor = paraEnd + 2; // account for double newline
    }
    return result;
  }, [story, storyParagraphs]);

  // Helpers for pinyin alignment from story-level pinyin
  const isChineseChar = (ch: string) => /[\u3400-\u9FFF]/.test(ch);
  const buildStoryCharPinyin = (fullHanzi: string, fullPinyin?: string) => {
    const tokens = (fullPinyin || "").trim().split(/\s+/).filter(Boolean);
    const chars = Array.from(fullHanzi || "");
    const perChar: string[] = new Array(chars.length).fill("");
    let t = 0;
    for (let i = 0; i < chars.length; i++) {
      if (isChineseChar(chars[i])) {
        perChar[i] = tokens[t] || "";
        if (tokens[t]) t++;
      } else {
        perChar[i] = "";
      }
    }
    return perChar;
  };

  if (!id) return null;

  return (
    <DashboardLayout
      title={data?.title || `Lesson #${id}`}
      subtitle={`HSK ${data?.level ?? ""}`}
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between sticky top-0 z-20 -mx-6 px-6 py-2 bg-[#222831]/80 backdrop-blur border-b border-[#30333a]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/lessons")}
              className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] transition-colors duration-200 cursor-pointer"
            >
              <div className="flex items-center gap-2 text-[#a6a6a6]">
                <ArrowLeft className="w-4 h-4" />
                <span className="font-inter text-sm">Exit</span>
              </div>
            </button>
            <button
              onClick={() =>
                setShowPinyin((prev) => {
                  const next = !prev;
                  // Force all blocks/turns to follow global state
                  setChunkPinyinOn(
                    Object.fromEntries(
                      (segmentedParagraphs || []).map((_, i) => [i, next])
                    ) as Record<number, boolean>
                  );
                  setTurnPinyinOn(
                    Object.fromEntries(
                      ((dialogue?.turns || []) as Array<unknown>).map(
                        (_, i) => [i, next]
                      )
                    ) as Record<number, boolean>
                  );
                  return next;
                })
              }
              className="px-3 py-2 bg-orange-500/20 border border-orange-500/40 rounded-lg hover:border-orange-500 text-orange-300 transition-colors duration-200 cursor-pointer"
            >
              <div className="flex items-center gap-2 text-[#a6a6a6]">
                {showPinyin ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                <span className="font-inter text-sm">Pinyin (All)</span>
              </div>
            </button>
            <button
              onClick={() =>
                setShowTranslation((prev) => {
                  const next = !prev;
                  // Force all blocks/turns to follow global state
                  setChunkTransOn(
                    Object.fromEntries(
                      (segmentedParagraphs || []).map((_, i) => [i, next])
                    ) as Record<number, boolean>
                  );
                  setTurnTransOn(
                    Object.fromEntries(
                      ((dialogue?.turns || []) as Array<unknown>).map(
                        (_, i) => [i, next]
                      )
                    ) as Record<number, boolean>
                  );
                  return next;
                })
              }
              className="px-3 py-2 bg-purple-600/20 border border-purple-600/40 rounded-lg hover:border-purple-600 text-purple-300 transition-colors duration-200 cursor-pointer"
            >
              <div className="flex items-center gap-2 text-[#a6a6a6]">
                {showTranslation ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                <span className="font-inter text-sm">Translation (All)</span>
              </div>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (multiSelect) {
                  // cancel selection
                  setMultiSelect(false);
                  setSelectedWords({});
                } else {
                  setMultiSelect(true);
                }
              }}
              className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] transition-colors duration-200 cursor-pointer"
            >
              <div className="flex items-center gap-2 text-[#a6a6a6]">
                {multiSelect ? (
                  <CheckSquare className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                <span className="font-inter text-sm">
                  {multiSelect
                    ? "Cancel Selection"
                    : "Select Words to Add to Flashcards"}
                </span>
              </div>
            </button>
            {multiSelect && (
              <button
                onClick={() => void addSelectedToFlashcards()}
                disabled={Object.keys(selectedWords).length === 0}
                className="px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Selected ({Object.keys(selectedWords).length})
              </button>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="p-2 hover:bg-[#404040] rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh"
            >
              <RefreshCw
                className={`w-4 h-4 text-[#a6a6a6] ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        {(story?.titlePinyin ||
          story?.titleTranslation ||
          dialogue?.titlePinyin ||
          dialogue?.titleTranslation ||
          data?.title) && (
          <div className="bg-[#2e323a] rounded-lg p-4 border border-[#404040]">
            {data?.title ? (
              <div className="text-white font-inter text-base mb-1">
                {data.title}
              </div>
            ) : null}
            {story?.titlePinyin || dialogue?.titlePinyin ? (
              <div className="text-[#9aa6ff] font-inter text-sm mb-1">
                {story?.titlePinyin || dialogue?.titlePinyin}
              </div>
            ) : null}
            {story?.titleTranslation || dialogue?.titleTranslation ? (
              <div className="text-[#a6a6a6] font-inter text-sm">
                {story?.titleTranslation || dialogue?.titleTranslation}
              </div>
            ) : null}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-[#a6a6a6]">
            <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span className="font-inter text-sm">Loading...</span>
          </div>
        ) : error ? (
          <p className="text-red-400 font-inter text-sm">{error}</p>
        ) : !data ? (
          <p className="text-[#a6a6a6] font-inter text-sm">No content</p>
        ) : (
          <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
            {story && (
              <div className="space-y-6">
                {segmentedParagraphs.map((segChunk, ci) => (
                  <div key={ci} className="space-y-2">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() =>
                          setChunkPinyinOn((s) => ({ ...s, [ci]: !s[ci] }))
                        }
                        className={`px-2 py-1 text-xs rounded border ${isChunkPinyinOn(ci) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer`}
                      >
                        Pinyin {isChunkPinyinOn(ci) ? "On" : "Off"}
                      </button>
                      <button
                        onClick={() =>
                          setChunkTransOn((s) => ({ ...s, [ci]: !s[ci] }))
                        }
                        className={`px-2 py-1 text-xs rounded border ${isChunkTransOn(ci) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer`}
                      >
                        Translation {isChunkTransOn(ci) ? "On" : "Off"}
                      </button>
                    </div>
                    <div className="leading-8 text-white font-inter text-[18px]">
                      {segChunk.map((seg: LessonToken, idx) => {
                        const isWord = Boolean(seg.isWord);
                        return (
                          <span
                            key={`${ci}-${idx}`}
                            className={`inline-flex ${isWord ? "flex-col items-center align-top" : "items-center"} mr-[2px]`}
                          >
                            {isChunkPinyinOn(ci) ? (
                              isWord && seg.pinyin ? (
                                <span className="text-xs text-[#9aa6ff] leading-none mb-[2px]">
                                  {seg.pinyin}
                                </span>
                              ) : (
                                <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                                  •
                                </span>
                              )
                            ) : null}
                            <span
                              className={`px-[1px] rounded ${isWord ? "hover:bg-[#404040] cursor-pointer" : ""}`}
                              title={seg.definition || ""}
                              onClick={(
                                e: ReactMouseEvent<HTMLSpanElement>
                              ) => {
                                if (!isWord) return;
                                if (multiSelect) {
                                  toggleSelectWord(
                                    `${ci}-${idx}-${seg.text}`,
                                    seg.text,
                                    seg.pinyin,
                                    ci,
                                    idx
                                  );
                                  return;
                                }
                                setPopup({
                                  open: true,
                                  x: e.clientX,
                                  y: e.clientY,
                                  word: seg.text,
                                  pinyin: seg.pinyin,
                                  definition: seg.definition,
                                  definitions: seg.definitions,
                                  paraIndex: ci,
                                  tokenIndex: idx,
                                });
                              }}
                            >
                              <span
                                className={
                                  multiSelect &&
                                  selectedWords[`${ci}-${idx}-${seg.text}`]
                                    ? "underline decoration-[#4040f2] decoration-2"
                                    : undefined
                                }
                              >
                                {seg.text}
                              </span>
                            </span>
                          </span>
                        );
                      })}
                    </div>
                    {isChunkTransOn(ci) && translationParagraphs[ci] && (
                      <div className="text-[#a6a6a6] font-inter text-[15px] border-l border-[#404040] pl-3">
                        {translationParagraphs[ci]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {dialogue && Array.isArray(dialogue.turns) && (
              <div className="space-y-4 mt-6">
                {dialogue.turns.map((turn, ti) => (
                  <div
                    key={ti}
                    className="bg-[#262a31] rounded-lg p-3 border border-[#3a3a3a]"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[#9aa6ff] font-inter text-sm">
                        {turn.speaker}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setTurnPinyinOn((s) => ({ ...s, [ti]: !s[ti] }))
                          }
                          className={`px-2 py-1 text-xs rounded border ${isTurnPinyinOn(ti) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer`}
                        >
                          Pinyin {isTurnPinyinOn(ti) ? "On" : "Off"}
                        </button>
                        <button
                          onClick={() =>
                            setTurnTransOn((s) => ({ ...s, [ti]: !s[ti] }))
                          }
                          className={`px-2 py-1 text-xs rounded border ${isTurnTransOn(ti) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer`}
                        >
                          Translation {isTurnTransOn(ti) ? "On" : "Off"}
                        </button>
                      </div>
                    </div>
                    <div className="leading-8 text-white font-inter text-[18px]">
                      {(turn.segments ?? []).map((seg: LessonToken, idx) => {
                        const isWord = Boolean(seg.isWord);
                        return (
                          <span
                            key={`${ti}-${idx}`}
                            className={`inline-flex ${isWord ? "flex-col items-center align-top" : "items-center"} mr-[2px]`}
                          >
                            {isTurnPinyinOn(ti) ? (
                              isWord && seg.pinyin ? (
                                <span className="text-xs text-[#9aa6ff] leading-none mb-[2px]">
                                  {seg.pinyin}
                                </span>
                              ) : (
                                <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                                  •
                                </span>
                              )
                            ) : null}
                            <span
                              className={`px-[1px] rounded ${isWord ? "hover:bg-[#404040] cursor-pointer" : ""}`}
                              title={seg.definition || ""}
                              onClick={(
                                e: ReactMouseEvent<HTMLSpanElement>
                              ) => {
                                if (!isWord) return;
                                if (multiSelect) {
                                  toggleSelectWord(
                                    `${ti}-${idx}-${seg.text}`,
                                    seg.text,
                                    seg.pinyin,
                                    ti,
                                    idx
                                  );
                                  return;
                                }
                                setPopup({
                                  open: true,
                                  x: e.clientX,
                                  y: e.clientY,
                                  word: seg.text,
                                  pinyin: seg.pinyin,
                                  definition: seg.definition,
                                  definitions: seg.definitions,
                                });
                              }}
                            >
                              <span
                                className={
                                  multiSelect &&
                                  selectedWords[`${ti}-${idx}-${seg.text}`]
                                    ? "underline decoration-[#4040f2] decoration-2"
                                    : undefined
                                }
                              >
                                {seg.text}
                              </span>
                            </span>
                          </span>
                        );
                      })}
                    </div>
                    {isTurnTransOn(ti) && turn.translation && (
                      <div className="text-[#a6a6a6] font-inter text-[15px] border-l border-[#404040] pl-3 mt-2">
                        {turn.translation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {popup.open && (
              <div
                ref={popupRef}
                style={{
                  position: "fixed",
                  left: Math.max(
                    10,
                    Math.min(popup.x - 110, window.innerWidth - 260)
                  ),
                  top: Math.max(10, popup.y - 150),
                  zIndex: 1000,
                }}
                className="bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
              >
                <div className="font-bold text-white text-lg truncate">
                  {popup.word}
                </div>
                {popup.pinyin && (
                  <div className="text-[#c6ceff] text-sm font-medium truncate">
                    {popup.pinyin}
                  </div>
                )}
                {Array.isArray(popup.definitions) &&
                popup.definitions.length > 0 ? (
                  <div className="text-xs text-[#a6a6a6] mt-2 space-y-1">
                    {popup.definitions.map((d, i) => (
                      <div key={i}>• {d}</div>
                    ))}
                  </div>
                ) : popup.definition ? (
                  <div className="text-xs text-[#a6a6a6] mt-2">
                    {popup.definition}
                  </div>
                ) : null}
                <div className="mt-3 pt-3 border-t border-[#404040]">
                  <button
                    onClick={() => {
                      // Build sentence-level context for the exact clicked token using stored indices
                      let ctx:
                        | {
                            hanzi?: string;
                            pinyin?: string;
                            translation?: string;
                          }
                        | undefined;
                      const paraIndex = popup.paraIndex ?? -1;
                      const tokenIndex = popup.tokenIndex ?? -1;
                      if (paraIndex >= 0 && tokenIndex >= 0) {
                        const paraHanzi = storyParagraphs[paraIndex] || "";
                        const hanziSentences = paraHanzi
                          .split(/(?<=[。！？!?])/)
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const tokens = segmentedParagraphs[paraIndex] || [];
                        const tokenStart = tokens
                          .slice(0, tokenIndex)
                          .reduce((acc, s) => acc + (s.text?.length || 0), 0);
                        let accLen = 0;
                        let sentenceIdx = 0;
                        for (let si = 0; si < hanziSentences.length; si++) {
                          const sTxt = hanziSentences[si];
                          const sLen = sTxt.length;
                          if (
                            tokenStart >= accLen &&
                            tokenStart < accLen + sLen
                          ) {
                            sentenceIdx = si;
                            break;
                          }
                          accLen += sLen;
                        }
                        const chosenHanzi =
                          sentenceIdx >= 0
                            ? hanziSentences[sentenceIdx]
                            : hanziSentences[0] || paraHanzi;
                        const paraTrans =
                          translationParagraphs[paraIndex] || "";
                        const transSentences = paraTrans
                          .split(/(?<=[.!?])\s+/)
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const chosenTrans =
                          sentenceIdx >= 0 && transSentences[sentenceIdx]
                            ? transSentences[sentenceIdx]
                            : undefined;
                        let chosenPinyin: string | undefined;
                        if (story?.pinyin) {
                          const storyCharPinyin = buildStoryCharPinyin(
                            story.hanzi,
                            story.pinyin
                          );
                          let storyOffset = 0;
                          for (let i = 0; i < paraIndex; i++) {
                            storyOffset +=
                              (storyParagraphs[i] || "").length + 2; // +2 for \n\n
                          }
                          const paraStart = storyOffset;
                          const sentStartInPara = hanziSentences
                            .slice(0, sentenceIdx)
                            .join("").length;
                          const sentGlobalStart = paraStart + sentStartInPara;
                          const sentLen = chosenHanzi.length;
                          const slice = storyCharPinyin.slice(
                            sentGlobalStart,
                            sentGlobalStart + sentLen
                          );
                          chosenPinyin = slice.join(" ");
                        }
                        ctx = {
                          hanzi: chosenHanzi,
                          pinyin: chosenPinyin,
                          translation: chosenTrans,
                        };
                      }
                      void addSingleToFlashcards(popup.word, ctx);
                      setPopup((p) => ({ ...p, open: false }));
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm font-inter">
                      Add to Flashcards
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
