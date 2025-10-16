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
import { AnimatePresence, motion } from "framer-motion";
import { getHSKPillClasses } from "@/lib/constants/hsk";

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
  const [finishLoading, setFinishLoading] = useState(false);

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
    hskLevel?: number;
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
        grammarNotes?: Array<{
          point: string;
          pointPinyin?: string;
          pointEn?: string;
          brief: string;
          briefPinyin?: string;
          briefEn?: string;
          pointSegments?: Array<{
            text: string;
            isWord?: boolean;
            pinyin?: string;
            definition?: string;
            definitions?: string[];
          }>;
          briefSegments?: Array<{
            text: string;
            isWord?: boolean;
            pinyin?: string;
            definition?: string;
            definitions?: string[];
          }>;
          examples?: Array<{
            zh: string;
            en?: string;
            pinyin?: string;
            segments?: Array<{
              text: string;
              isWord?: boolean;
              pinyin?: string;
              definition?: string;
              definitions?: string[];
            }>;
          }>;
        }>;
        tipsRich?: Array<{
          zh: string;
          en?: string;
          segments?: Array<{
            text: string;
            isWord?: boolean;
            pinyin?: string;
            definition?: string;
            definitions?: string[];
          }>;
        }>;
        quiz?: {
          items?: Array<{
            question: {
              zh: string;
              translation?: string;
              segments?: Array<{
                text: string;
                isWord?: boolean;
                pinyin?: string;
                definition?: string;
                definitions?: string[];
                hskLevel?: number;
              }>;
            };
            options?: Array<{
              zh: string;
              translation?: string;
              segments?: Array<{
                text: string;
                isWord?: boolean;
                pinyin?: string;
                definition?: string;
                definitions?: string[];
                hskLevel?: number;
              }>;
            }>;
            answerIndex?: number;
            rationale?: string;
          }>;
          passingScore?: number;
        };
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
        grammarNotes?: Array<{
          point: string;
          pointPinyin?: string;
          pointEn?: string;
          brief: string;
          briefPinyin?: string;
          briefEn?: string;
          pointSegments?: Array<{
            text: string;
            isWord?: boolean;
            pinyin?: string;
            definition?: string;
            definitions?: string[];
          }>;
          briefSegments?: Array<{
            text: string;
            isWord?: boolean;
            pinyin?: string;
            definition?: string;
            definitions?: string[];
          }>;
          examples?: Array<{
            zh: string;
            en?: string;
            pinyin?: string;
            segments?: Array<{
              text: string;
              isWord?: boolean;
              pinyin?: string;
              definition?: string;
              definitions?: string[];
            }>;
          }>;
        }>;
        tipsRich?: Array<{
          zh: string;
          en?: string;
          segments?: Array<{
            text: string;
            isWord?: boolean;
            pinyin?: string;
            definition?: string;
            definitions?: string[];
          }>;
        }>;
        turns?: Array<{
          speaker: string;
          hanzi: string;
          pinyin?: string;
          translation?: string;
          segments?: LessonToken[];
        }>;
        quiz?: {
          items?: Array<{
            question: {
              zh: string;
              translation?: string;
              segments?: Array<{
                text: string;
                isWord?: boolean;
                pinyin?: string;
                definition?: string;
                definitions?: string[];
                hskLevel?: number;
              }>;
            };
            options?: Array<{
              zh: string;
              translation?: string;
              segments?: Array<{
                text: string;
                isWord?: boolean;
                pinyin?: string;
                definition?: string;
                definitions?: string[];
                hskLevel?: number;
              }>;
            }>;
            answerIndex?: number;
            rationale?: string;
          }>;
          passingScore?: number;
        };
      }
    | undefined;

  // Popup for token details
  const [popup, setPopup] = useState<{
    open: boolean;
    x: number; // relative to content container
    y: number; // relative to content container (anchor at token top)
    anchorH?: number; // height of the clicked token for below placement
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    paraIndex?: number;
    tokenIndex?: number;
    hskLevel?: number;
  }>({ open: false, x: 0, y: 0, word: "" });
  const popupRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [popupPos, setPopupPos] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopup((p) => ({ ...p, open: false }));
      }
    };
    if (popup.open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [popup.open]);

  // Compute popup position after it renders to avoid cutoff; clamp within container
  useEffect(() => {
    if (!popup.open) {
      setPopupPos(null);
      return;
    }
    const modal = popupRef.current;
    const container = contentRef.current;
    if (!modal || !container) return;
    const modalRect = modal.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    const margin = 8;
    const contW = contRect.width;
    const contH = contRect.height;

    // Compute visible vertical region inside container accounting for sticky toolbar and viewport
    const toolbar = document.querySelector(
      '[role="toolbar"][aria-label="Lesson controls"]'
    ) as HTMLElement | null;
    const toolbarRect = toolbar?.getBoundingClientRect();
    const toolbarBottom = toolbarRect ? toolbarRect.bottom : 0;
    const visibleTopInContainer = Math.max(0, toolbarBottom - contRect.top);
    const visibleBottomInContainer = Math.min(
      contH,
      Math.max(0, window.innerHeight - contRect.top)
    );

    // Horizontal: center on anchor, then clamp within container bounds
    let left = popup.x - modalRect.width / 2;
    left = Math.max(margin, Math.min(left, contW - modalRect.width - margin));

    // Vertical: decide above/below by available space within visible region
    const anchorH = popup.anchorH || 0;
    const availableAbove = popup.y - visibleTopInContainer - margin;
    const availableBelow =
      visibleBottomInContainer - (popup.y + anchorH) - margin;
    let top: number;
    if (modalRect.height <= availableAbove || availableBelow < 0) {
      // Above fits (or no space below)
      top = Math.max(
        visibleTopInContainer + margin,
        popup.y - modalRect.height - margin
      );
    } else if (modalRect.height <= availableBelow || availableAbove < 0) {
      // Below fits (or no space above)
      top = Math.min(
        visibleBottomInContainer - modalRect.height - margin,
        popup.y + anchorH + margin
      );
    } else {
      // Prefer below but clamp inside visible region
      top = Math.min(
        visibleBottomInContainer - modalRect.height - margin,
        Math.max(visibleTopInContainer + margin, popup.y + anchorH + margin)
      );
    }

    setPopupPos({ left, top });
  }, [popup.open, popup.x, popup.y, popup.anchorH]);

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
    context?: { hanzi?: string; pinyin?: string; translation?: string },
    vocab?: { pinyin?: string; definition?: string; hskLevel?: number }
  ) => {
    try {
      const { post } = await import("@/lib/http/http");
      await post("flashcards", {
        hanzi,
        sentenceHanzi: context?.hanzi,
        sentencePinyin: context?.pinyin,
        sentenceTranslation: context?.translation,
        vocabPinyin: vocab?.pinyin,
        vocabDefinition: vocab?.definition,
        vocabHskLevel: vocab?.hskLevel,
      });
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

        // Handle notes words (paraIndex = -1)
        if (w.paraIndex === -1) {
          // For notes words, use the word itself as context
          sentenceCtx = {
            hanzi: w.text,
            pinyin: w.pinyin,
            translation: undefined,
          };
        } else if (
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
        const { post } = await import("@/lib/http/http");
        await post("flashcards", {
          hanzi: w.text,
          sentenceHanzi: sentenceCtx?.hanzi,
          sentencePinyin: sentenceCtx?.pinyin,
          sentenceTranslation: sentenceCtx?.translation,
          vocabPinyin: w.pinyin,
          vocabDefinition: (() => {
            if (
              typeof w.paraIndex === "number" &&
              typeof w.tokenIndex === "number"
            ) {
              const seg = (segmentedParagraphs[w.paraIndex] || [])[
                w.tokenIndex
              ] as LessonToken | undefined;
              if (seg) {
                if (
                  Array.isArray(seg.definitions) &&
                  seg.definitions.length > 0
                )
                  return seg.definitions[0];
                if (seg.definition) return seg.definition;
              }
            }
            return undefined;
          })(),
          vocabHskLevel: (() => {
            if (
              typeof w.paraIndex === "number" &&
              typeof w.tokenIndex === "number"
            ) {
              const seg = (segmentedParagraphs[w.paraIndex] || [])[
                w.tokenIndex
              ] as LessonToken | undefined;
              if (seg && typeof seg.hskLevel === "number") return seg.hskLevel;
            }
            return undefined;
          })(),
        });
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

  // Derive underline color from HSK pill classes while using a fixed set of Tailwind classes
  const hskUnderlineClass = (level?: number) => {
    if (!level) return "";
    const pill = getHSKPillClasses(level);
    if (pill.includes("text-green-300"))
      return "underline decoration-green-300/80 decoration-2 underline-offset-[3px]";
    if (pill.includes("text-emerald-300"))
      return "underline decoration-emerald-300/80 decoration-2 underline-offset-[3px]";
    if (pill.includes("text-blue-300"))
      return "underline decoration-blue-300/80 decoration-2 underline-offset-[3px]";
    if (pill.includes("text-indigo-300"))
      return "underline decoration-indigo-300/80 decoration-2 underline-offset-[3px]";
    if (pill.includes("text-purple-300"))
      return "underline decoration-purple-300/80 decoration-2 underline-offset-[3px]";
    if (pill.includes("text-pink-300"))
      return "underline decoration-pink-300/80 decoration-2 underline-offset-[3px]";
    if (pill.includes("text-orange-300"))
      return "underline decoration-orange-300/80 decoration-2 underline-offset-[3px]";
    return "";
  };

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

  // Notes-specific popup & pinyin toggle
  const [notesPinyinOn, setNotesPinyinOn] = useState<boolean>(true);
  const [notesPopup, setNotesPopup] = useState<{
    open: boolean;
    x: number;
    y: number;
    anchorH?: number;
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    hskLevel?: number;
  }>({ open: false, x: 0, y: 0, word: "" });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const node = notesPopupRef.current;
      if (node && !node.contains(e.target as Node)) {
        setNotesPopup((p) => ({ ...p, open: false }));
      }
    };
    if (notesPopup.open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [notesPopup.open]);

  const notesPopupRef = useRef<HTMLDivElement | null>(null);
  const [notesPopupPos, setNotesPopupPos] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    if (!notesPopup.open) {
      setNotesPopupPos(null);
      return;
    }
    const modal = notesPopupRef.current;
    const container = contentRef.current;
    if (!modal || !container) return;
    const modalRect = modal.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    const margin = 8;
    const contW = contRect.width;
    const contH = contRect.height;

    // Compute visible vertical region inside container accounting for sticky toolbar and viewport
    const toolbar = document.querySelector(
      '[role="toolbar"][aria-label="Lesson controls"]'
    ) as HTMLElement | null;
    const toolbarRect = toolbar?.getBoundingClientRect();
    const toolbarBottom = toolbarRect ? toolbarRect.bottom : 0;
    const visibleTopInContainer = Math.max(0, toolbarBottom - contRect.top);
    const visibleBottomInContainer = Math.min(
      contH,
      Math.max(0, window.innerHeight - contRect.top)
    );

    // Horizontal: center on anchor, then clamp within container bounds
    let left = notesPopup.x - modalRect.width / 2;
    left = Math.max(margin, Math.min(left, contW - modalRect.width - margin));

    // Vertical: decide above/below by available space within visible region
    const anchorH = notesPopup.anchorH || 0;
    const availableAbove = notesPopup.y - visibleTopInContainer - margin;
    const availableBelow =
      visibleBottomInContainer - (notesPopup.y + anchorH) - margin;
    let top: number;
    if (modalRect.height <= availableAbove || availableBelow < 0) {
      top = Math.max(
        visibleTopInContainer + margin,
        notesPopup.y - modalRect.height - margin
      );
    } else if (modalRect.height <= availableBelow || availableAbove < 0) {
      top = Math.min(
        visibleBottomInContainer - modalRect.height - margin,
        notesPopup.y + anchorH + margin
      );
    } else {
      top = Math.min(
        visibleBottomInContainer - modalRect.height - margin,
        Math.max(
          visibleTopInContainer + margin,
          notesPopup.y + anchorH + margin
        )
      );
    }

    setNotesPopupPos({ left, top });
  }, [notesPopup.open, notesPopup.x, notesPopup.y, notesPopup.anchorH]);

  const renderNotesSegmentsWithPopup = (
    segments:
      | Array<{
          text: string;
          isWord?: boolean;
          pinyin?: string;
          definition?: string;
          definitions?: string[];
        }>
      | undefined,
    fallbackZh: string,
    fallbackEn?: string,
    showPinyin?: boolean,
    notesContext?: {
      section: string;
      noteIndex: number;
      field: string;
      exampleIndex?: number;
    }
  ) => {
    if (!Array.isArray(segments) || segments.length === 0) {
      return (
        <>
          <div className="text-[#c9d1d9]">{fallbackZh}</div>
          {showPinyin && (
            <div className="text-[#9aa6ff] text-xs">{fallbackEn}</div>
          )}
        </>
      );
    }
    return (
      <div className="leading-7">
        {segments.map((seg, idx) => {
          const isWord = Boolean(seg.isWord);
          return (
            <span
              key={idx}
              className="inline-flex flex-col items-center align-top mr-[2px]"
            >
              {showPinyin ? (
                isWord && seg.pinyin ? (
                  <span className="text-[10px] text-[#9aa6ff] leading-none mb-[2px]">
                    {seg.pinyin}
                  </span>
                ) : (
                  <span className="text-[10px] opacity-0 leading-none mb-[2px] select-none">
                    •
                  </span>
                )
              ) : null}
              <span
                className={`px-[1px] rounded ${isWord ? "hover:bg-[#404040] cursor-pointer" : ""}`}
                title={seg.definition || ""}
                onClick={(e: ReactMouseEvent<HTMLSpanElement>) => {
                  if (!isWord) return;

                  // Handle multi-select mode
                  if (multiSelect && notesContext) {
                    const key = `notes-${notesContext.section}-${notesContext.noteIndex}-${notesContext.field}${notesContext.exampleIndex !== undefined ? `-${notesContext.exampleIndex}` : ""}-${idx}-${seg.text}`;
                    toggleSelectWord(
                      key,
                      seg.text,
                      seg.pinyin,
                      -1, // Use -1 to indicate notes (not main content)
                      idx
                    );
                    return;
                  }

                  // Handle popup mode
                  const anchor = (
                    e.currentTarget as HTMLSpanElement
                  ).getBoundingClientRect();
                  const container = contentRef.current?.getBoundingClientRect();
                  const px = container
                    ? anchor.left - container.left + anchor.width / 2
                    : e.clientX;
                  const py = container ? anchor.top - container.top : e.clientY;
                  setNotesPopup({
                    open: true,
                    x: px,
                    y: py,
                    anchorH: anchor.height,
                    word: seg.text,
                    pinyin: seg.pinyin,
                    definition: seg.definition,
                    definitions: seg.definitions,
                    hskLevel: (seg as unknown as { hskLevel?: number })
                      .hskLevel,
                  });
                }}
              >
                <span
                  className={
                    multiSelect &&
                    notesContext &&
                    selectedWords[
                      `notes-${notesContext.section}-${notesContext.noteIndex}-${notesContext.field}${notesContext.exampleIndex !== undefined ? `-${notesContext.exampleIndex}` : ""}-${idx}-${seg.text}`
                    ]
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
    );
  };

  if (!id) return null;

  return (
    <DashboardLayout
      title={data?.title || `Lesson #${id}`}
      subtitle={`HSK ${data?.level ?? ""}`}
    >
      <div className="p-6 space-y-6">
        <div
          className="flex flex-wrap items-center justify-between gap-2 sticky top-0 z-20 -mx-6 px-6 py-2 bg-[#222831]/80 backdrop-blur border-b border-[#30333a]"
          role="toolbar"
          aria-label="Lesson controls"
        >
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => router.push("/lessons")}
              className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#222831]"
              type="button"
              aria-label="Back to lessons"
            >
              <div className="flex items-center gap-2 text-[#a6a6a6]">
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
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
              className="px-3 py-2 bg-orange-500/20 border border-orange-500/40 rounded-lg hover:border-orange-500 text-orange-300 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-400 focus-visible:ring-offset-[#222831]"
              type="button"
              aria-pressed={showPinyin}
              aria-label={showPinyin ? "Hide all pinyin" : "Show all pinyin"}
            >
              <div className="flex items-center gap-2 text-[#a6a6a6]">
                {showPinyin ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
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
              className="px-3 py-2 bg-purple-600/20 border border-purple-600/40 rounded-lg hover:border-purple-600 text-purple-300 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-400 focus-visible:ring-offset-[#222831]"
              type="button"
              aria-pressed={showTranslation}
              aria-label={
                showTranslation
                  ? "Hide all translations"
                  : "Show all translations"
              }
            >
              <div className="flex items-center gap-2 text-[#a6a6a6]">
                {showTranslation ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 26 25"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M1 3.46154H9.61539M9.61539 3.46154H15.1539M9.61539 3.46154V1M18.2308 3.46154H15.1539M15.1539 3.46154C14.144 6.82785 12.0292 10.01 9.61539 12.8066M9.61539 12.8066C7.61662 15.1223 5.41282 17.1737 3.46154 18.8462M9.61539 12.8066C8.38462 11.4615 6.41539 8.75385 5.92308 7.76923M9.61539 12.8066L13.3077 16.3846"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M15.1538 23.1538L16.5605 19.4615M16.5605 19.4615L20.0769 10.2307L23.5933 19.4615M16.5605 19.4615H23.5933M25 23.1538L23.5933 19.4615"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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
              className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#222831]"
              type="button"
              aria-pressed={multiSelect}
              aria-label={
                multiSelect
                  ? "Cancel word selection"
                  : "Select words to add to flashcards"
              }
            >
              <div className="flex items-center gap-2 text-[#a6a6a6]">
                {multiSelect ? (
                  <CheckSquare className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Square className="w-4 h-4" aria-hidden="true" />
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
                className="px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#222831]"
                type="button"
                aria-label="Add selected words to flashcards"
              >
                Add Selected ({Object.keys(selectedWords).length})
              </button>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="p-2 hover:bg-[#404040] rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#222831]"
              title="Refresh"
              type="button"
              aria-label="Refresh lesson"
            >
              <RefreshCw
                className={`w-4 h-4 text-[#a6a6a6] ${loading ? "motion-safe:animate-spin" : ""}`}
                aria-hidden="true"
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
          <div
            ref={contentRef}
            className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] relative"
          >
            {story && (
              <div className="space-y-6">
                {segmentedParagraphs.map((segChunk, ci) => (
                  <div key={ci} className="space-y-2">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() =>
                          setChunkPinyinOn((s) => ({ ...s, [ci]: !s[ci] }))
                        }
                        className={`px-2 py-1 text-xs rounded border ${isChunkPinyinOn(ci) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#2e323a]`}
                        type="button"
                        aria-pressed={isChunkPinyinOn(ci)}
                        aria-label={
                          isChunkPinyinOn(ci)
                            ? "Hide pinyin for paragraph"
                            : "Show pinyin for paragraph"
                        }
                      >
                        Pinyin {isChunkPinyinOn(ci) ? "On" : "Off"}
                      </button>
                      <button
                        onClick={() =>
                          setChunkTransOn((s) => ({ ...s, [ci]: !s[ci] }))
                        }
                        className={`px-2 py-1 text-xs rounded border ${isChunkTransOn(ci) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#2e323a]`}
                        type="button"
                        aria-pressed={isChunkTransOn(ci)}
                        aria-label={
                          isChunkTransOn(ci)
                            ? "Hide translation for paragraph"
                            : "Show translation for paragraph"
                        }
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 26 25"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M1 3.46154H9.61539M9.61539 3.46154H15.1539M9.61539 3.46154V1M18.2308 3.46154H15.1539M15.1539 3.46154C14.144 6.82785 12.0292 10.01 9.61539 12.8066M9.61539 12.8066C7.61662 15.1223 5.41282 17.1737 3.46154 18.8462M9.61539 12.8066C8.38462 11.4615 6.41539 8.75385 5.92308 7.76923M9.61539 12.8066L13.3077 16.3846"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M15.1538 23.1538L16.5605 19.4615M16.5605 19.4615L20.0769 10.2307L23.5933 19.4615M16.5605 19.4615H23.5933M25 23.1538L23.5933 19.4615"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                    <div className="leading-8 text-white font-inter text-[18px]">
                      {segChunk.map((seg: LessonToken, idx) => {
                        const isWord = Boolean(seg.isWord);
                        return (
                          <span
                            key={`${ci}-${idx}`}
                            className={`inline-flex flex-col items-center align-top mr-[2px]`}
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
                                const anchor = (
                                  e.currentTarget as HTMLSpanElement
                                ).getBoundingClientRect();
                                const container =
                                  contentRef.current?.getBoundingClientRect();
                                const px = container
                                  ? anchor.left -
                                    container.left +
                                    anchor.width / 2
                                  : e.clientX;
                                const py = container
                                  ? anchor.top - container.top
                                  : e.clientY;
                                setPopup({
                                  open: true,
                                  x: px,
                                  y: py,
                                  anchorH: anchor.height,
                                  word: seg.text,
                                  pinyin: seg.pinyin,
                                  definition: seg.definition,
                                  definitions: seg.definitions,
                                  paraIndex: ci,
                                  tokenIndex: idx,
                                  hskLevel: seg.hskLevel as number | undefined,
                                });
                              }}
                            >
                              <span
                                className={
                                  multiSelect &&
                                  selectedWords[`${ci}-${idx}-${seg.text}`]
                                    ? "underline decoration-[#4040f2] decoration-2"
                                    : isWord && typeof seg.hskLevel === "number"
                                      ? hskUnderlineClass(seg.hskLevel)
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
                    <AnimatePresence initial={false}>
                      {isChunkTransOn(ci) && translationParagraphs[ci] && (
                        <motion.div
                          key="chunk-translation"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28, ease: "easeOut" }}
                          style={{ overflow: "hidden" }}
                          className="text-[#a6a6a6] font-inter text-[15px] border-l border-[#404040] pl-3"
                        >
                          {translationParagraphs[ci]}
                        </motion.div>
                      )}
                    </AnimatePresence>
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
                          className={`px-2 py-1 text-xs rounded border ${isTurnPinyinOn(ti) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#262a31]`}
                          type="button"
                          aria-pressed={isTurnPinyinOn(ti)}
                          aria-label={
                            isTurnPinyinOn(ti)
                              ? "Hide pinyin for this turn"
                              : "Show pinyin for this turn"
                          }
                        >
                          Pinyin {isTurnPinyinOn(ti) ? "On" : "Off"}
                        </button>
                        <button
                          onClick={() =>
                            setTurnTransOn((s) => ({ ...s, [ti]: !s[ti] }))
                          }
                          className={`px-2 py-1 text-xs rounded border ${isTurnTransOn(ti) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#262a31]`}
                          type="button"
                          aria-pressed={isTurnTransOn(ti)}
                          aria-label={
                            isTurnTransOn(ti)
                              ? "Hide translation for this turn"
                              : "Show translation for this turn"
                          }
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 26 25"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M1 3.46154H9.61539M9.61539 3.46154H15.1539M9.61539 3.46154V1M18.2308 3.46154H15.1539M15.1539 3.46154C14.144 6.82785 12.0292 10.01 9.61539 12.8066M9.61539 12.8066C7.61662 15.1223 5.41282 17.1737 3.46154 18.8462M9.61539 12.8066C8.38462 11.4615 6.41539 8.75385 5.92308 7.76923M9.61539 12.8066L13.3077 16.3846"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M15.1538 23.1538L16.5605 19.4615M16.5605 19.4615L20.0769 10.2307L23.5933 19.4615M16.5605 19.4615H23.5933M25 23.1538L23.5933 19.4615"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="leading-8 text-white font-inter text-[18px]">
                      {(turn.segments ?? []).map((seg: LessonToken, idx) => {
                        const isWord = Boolean(seg.isWord);
                        return (
                          <span
                            key={`${ti}-${idx}`}
                            className={`inline-flex flex-col items-center align-top mr-[2px]`}
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
                                const anchor = (
                                  e.currentTarget as HTMLSpanElement
                                ).getBoundingClientRect();
                                const container =
                                  contentRef.current?.getBoundingClientRect();
                                const px = container
                                  ? anchor.left -
                                    container.left +
                                    anchor.width / 2
                                  : e.clientX;
                                const py = container
                                  ? anchor.top - container.top
                                  : e.clientY;
                                setPopup({
                                  open: true,
                                  x: px,
                                  y: py,
                                  anchorH: anchor.height,
                                  word: seg.text,
                                  pinyin: seg.pinyin,
                                  definition: seg.definition,
                                  definitions: seg.definitions,
                                  hskLevel: (
                                    seg as unknown as { hskLevel?: number }
                                  ).hskLevel,
                                });
                              }}
                            >
                              <span
                                className={
                                  multiSelect &&
                                  selectedWords[`${ti}-${idx}-${seg.text}`]
                                    ? "underline decoration-[#4040f2] decoration-2"
                                    : isWord && typeof seg.hskLevel === "number"
                                      ? hskUnderlineClass(seg.hskLevel)
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
                    <AnimatePresence initial={false}>
                      {isTurnTransOn(ti) && turn.translation && (
                        <motion.div
                          key={`turn-translation-${ti}`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28, ease: "easeOut" }}
                          style={{ overflow: "hidden" }}
                          className="text-[#a6a6a6] font-inter text-[15px] border-l border-[#404040] pl-3 mt-2"
                        >
                          {turn.translation}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
                {/* Quiz section (dialogue) */}
                {(() => {
                  type Seg = {
                    text: string;
                    isWord?: boolean;
                    pinyin?: string;
                    definition?: string;
                    definitions?: string[];
                    hskLevel?: number;
                  };
                  type QuizShape = {
                    items?: Array<{
                      question: {
                        zh: string;
                        translation?: string;
                        segments?: Seg[];
                      };
                      options?: Array<{
                        zh: string;
                        translation?: string;
                        segments?: Seg[];
                      }>;
                      answerIndex?: number;
                      rationale?: string;
                    }>;
                    passingScore?: number;
                  };
                  const dialogueContent = dialogue as unknown as
                    | { quiz?: QuizShape }
                    | undefined;
                  const quiz = dialogueContent?.quiz;
                  if (
                    !quiz ||
                    !Array.isArray(quiz.items) ||
                    quiz.items.length === 0
                  )
                    return null;
                  return (
                    <div className="mt-6">
                      <LessonQuizView
                        quiz={quiz}
                        disabled={Boolean(data?.finished)}
                        onAddFlashcard={(hanzi, ctx, vocab) =>
                          void addSingleToFlashcards(hanzi, ctx, vocab)
                        }
                        onPerfectScore={async () => {
                          if (data?.finished) return;
                          try {
                            await lessonsApi.finish(id);
                            setData((prev) =>
                              prev ? { ...prev, finished: true } : prev
                            );
                            toast.success("Marked as finished");
                          } catch {
                            toast.error("Failed to mark as finished");
                          }
                        }}
                      />
                    </div>
                  );
                })()}
                {Array.isArray(dialogue.grammarNotes) &&
                  dialogue.grammarNotes.length > 0 && (
                    <div className="mt-4 border border-[#3a3a3a] rounded-lg p-3 bg-[#1e2229]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-white">
                          Notes
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setNotesPinyinOn((v) => !v)}
                            className={`px-2 py-1 text-xs rounded border ${
                              notesPinyinOn
                                ? "border-[#4040f2] text-[#9aa6ff]"
                                : "border-[#404040] text-[#a6a6a6]"
                            } cursor-pointer`}
                            type="button"
                            aria-pressed={notesPinyinOn}
                            aria-label={
                              notesPinyinOn
                                ? "Hide notes pinyin"
                                : "Show notes pinyin"
                            }
                          >
                            Pinyin {notesPinyinOn ? "On" : "Off"}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {dialogue.grammarNotes.slice(0, 3).map((gn, gi) => (
                          <div
                            key={gi}
                            className="text-[16px] text-[#c9d1d9] border border-[#2a2e36] bg-[#1a1f27] rounded-lg p-2 space-y-2"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[1px] rounded">
                                  Point
                                </span>
                              </div>
                              <div>
                                {Array.isArray(gn.pointSegments) &&
                                gn.pointSegments.length > 0 ? (
                                  renderNotesSegmentsWithPopup(
                                    gn.pointSegments,
                                    gn.point,
                                    gn.pointEn,
                                    notesPinyinOn,
                                    {
                                      section: "dialogue",
                                      noteIndex: gi,
                                      field: "point",
                                    }
                                  )
                                ) : (
                                  <>
                                    <div className="text-white">{gn.point}</div>
                                    {notesPinyinOn && gn.pointPinyin ? (
                                      <div className="text-[#9aa6ff]">
                                        {gn.pointPinyin}
                                      </div>
                                    ) : null}
                                  </>
                                )}
                              </div>
                              {gn.pointEn ? (
                                <div className="text-[14px] text-[#8b949e]">
                                  {gn.pointEn}
                                </div>
                              ) : null}
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[1px] rounded">
                                  Brief
                                </span>
                              </div>
                              <div>
                                {Array.isArray(gn.briefSegments) &&
                                gn.briefSegments.length > 0 ? (
                                  renderNotesSegmentsWithPopup(
                                    gn.briefSegments,
                                    gn.brief,
                                    gn.briefEn,
                                    notesPinyinOn,
                                    {
                                      section: "dialogue",
                                      noteIndex: gi,
                                      field: "brief",
                                    }
                                  )
                                ) : (
                                  <>
                                    <div className="text-white">{gn.brief}</div>
                                    {notesPinyinOn && gn.briefPinyin ? (
                                      <div className="text-[#9aa6ff]">
                                        {gn.briefPinyin}
                                      </div>
                                    ) : null}
                                  </>
                                )}
                              </div>
                              {gn.briefEn ? (
                                <div className="text-[14px] text-[#8b949e]">
                                  {gn.briefEn}
                                </div>
                              ) : null}
                            </div>

                            {Array.isArray(gn.examples) &&
                              gn.examples.length > 0 && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[1px] rounded">
                                      Examples
                                    </span>
                                  </div>
                                  <div className="space-y-1">
                                    {gn.examples.slice(0, 2).map((ex, ei) => (
                                      <div
                                        key={ei}
                                        className="border border-[#2a2e36] rounded p-2 bg-[#171b21]"
                                      >
                                        {Array.isArray(ex.segments) &&
                                        ex.segments.length > 0 ? (
                                          <>
                                            {renderNotesSegmentsWithPopup(
                                              ex.segments,
                                              ex.zh,
                                              ex.en,
                                              notesPinyinOn,
                                              {
                                                section: "dialogue",
                                                noteIndex: gi,
                                                field: "example",
                                                exampleIndex: ei,
                                              }
                                            )}
                                            {ex.en ? (
                                              <div className="text-[14px] text-[#8b949e]">
                                                {ex.en}
                                              </div>
                                            ) : null}
                                          </>
                                        ) : (
                                          <>
                                            <div className="text-white">
                                              {ex.zh}
                                            </div>
                                            {notesPinyinOn && ex.pinyin ? (
                                              <div className="text-[#9aa6ff] text-[14px]">
                                                {ex.pinyin}
                                              </div>
                                            ) : null}
                                            {ex.en ? (
                                              <div className="text-[14px] text-[#8b949e]">
                                                {ex.en}
                                              </div>
                                            ) : null}
                                          </>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}

            {/* Quiz section (story only; dialogue quiz is rendered above notes inside the dialogue block) */}
            {(() => {
              type Seg = {
                text: string;
                isWord?: boolean;
                pinyin?: string;
                definition?: string;
                definitions?: string[];
                hskLevel?: number;
              };
              type QuizShape = {
                items?: Array<{
                  question: {
                    zh: string;
                    translation?: string;
                    segments?: Seg[];
                  };
                  options?: Array<{
                    zh: string;
                    translation?: string;
                    segments?: Seg[];
                  }>;
                  answerIndex?: number;
                  rationale?: string;
                }>;
                passingScore?: number;
              };
              const hasDialogue = Boolean(
                dialogue &&
                  Array.isArray(
                    (dialogue as unknown as { turns?: unknown[] }).turns
                  )
              );
              const hasStory = Boolean(storySection && story);
              const storyContent = story as unknown as
                | { quiz?: QuizShape }
                | undefined;
              if (hasDialogue || !hasStory) return null;
              const quiz = storyContent?.quiz;
              if (
                !quiz ||
                !Array.isArray(quiz.items) ||
                quiz.items.length === 0
              )
                return null;
              return (
                <div className="mt-6">
                  <LessonQuizView
                    quiz={quiz}
                    disabled={Boolean(data?.finished)}
                    onAddFlashcard={(hanzi, ctx, vocab) =>
                      void addSingleToFlashcards(hanzi, ctx, vocab)
                    }
                    onPerfectScore={async () => {
                      if (data?.finished) return;
                      try {
                        await lessonsApi.finish(id);
                        setData((prev) =>
                          prev ? { ...prev, finished: true } : prev
                        );
                        toast.success("Marked as finished");
                      } catch {
                        toast.error("Failed to mark as finished");
                      }
                    }}
                  />
                </div>
              );
            })()}

            {story &&
              Array.isArray(story.grammarNotes) &&
              story.grammarNotes.length > 0 && (
                <div className="mt-6 border border-[#3a3a3a] rounded-lg p-3 bg-[#1e2229]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-white">
                      Notes
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setNotesPinyinOn((v) => !v)}
                        className={`px-2 py-1 text-xs rounded border ${
                          notesPinyinOn
                            ? "border-[#4040f2] text-[#9aa6ff]"
                            : "border-[#404040] text-[#a6a6a6]"
                        } cursor-pointer`}
                        type="button"
                        aria-pressed={notesPinyinOn}
                      >
                        Pinyin {notesPinyinOn ? "On" : "Off"}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {story.grammarNotes.slice(0, 3).map((gn, gi) => (
                      <div
                        key={gi}
                        className="text-[16px] text-[#c9d1d9] border border-[#2a2e36] bg-[#1a1f27] rounded-lg p-2 space-y-2"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[1px] rounded">
                              Point
                            </span>
                          </div>
                          <div>
                            {Array.isArray(gn.pointSegments) &&
                            gn.pointSegments.length > 0 ? (
                              renderNotesSegmentsWithPopup(
                                gn.pointSegments,
                                gn.point,
                                gn.pointEn,
                                notesPinyinOn,
                                {
                                  section: "story",
                                  noteIndex: gi,
                                  field: "point",
                                }
                              )
                            ) : (
                              <>
                                <div className="text-white">{gn.point}</div>
                                {notesPinyinOn && gn.pointPinyin ? (
                                  <div className="text-[#9aa6ff]">
                                    {gn.pointPinyin}
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                          {gn.pointEn ? (
                            <div className="text-[14px] text-[#8b949e]">
                              {gn.pointEn}
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[1px] rounded">
                              Brief
                            </span>
                          </div>
                          <div>
                            {Array.isArray(gn.briefSegments) &&
                            gn.briefSegments.length > 0 ? (
                              renderNotesSegmentsWithPopup(
                                gn.briefSegments,
                                gn.brief,
                                gn.briefEn,
                                notesPinyinOn,
                                {
                                  section: "story",
                                  noteIndex: gi,
                                  field: "brief",
                                }
                              )
                            ) : (
                              <>
                                <div className="text-white">{gn.brief}</div>
                                {notesPinyinOn && gn.briefPinyin ? (
                                  <div className="text-[#9aa6ff]">
                                    {gn.briefPinyin}
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                          {gn.briefEn ? (
                            <div className="text-[14px] text-[#8b949e]">
                              {gn.briefEn}
                            </div>
                          ) : null}
                        </div>

                        {Array.isArray(gn.examples) &&
                          gn.examples.length > 0 && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[1px] rounded">
                                  Examples
                                </span>
                              </div>
                              <div className="space-y-1">
                                {gn.examples.slice(0, 2).map((ex, ei) => (
                                  <div
                                    key={ei}
                                    className="border border-[#2a2e36] rounded p-2 bg-[#171b21]"
                                  >
                                    {Array.isArray(ex.segments) &&
                                    ex.segments.length > 0 ? (
                                      <>
                                        {renderNotesSegmentsWithPopup(
                                          ex.segments,
                                          ex.zh,
                                          ex.en,
                                          notesPinyinOn,
                                          {
                                            section: "story",
                                            noteIndex: gi,
                                            field: "example",
                                            exampleIndex: ei,
                                          }
                                        )}
                                        {ex.en ? (
                                          <div className="text-[14px] text-[#8b949e]">
                                            {ex.en}
                                          </div>
                                        ) : null}
                                      </>
                                    ) : (
                                      <>
                                        <div className="text-white">
                                          {ex.zh}
                                        </div>
                                        {notesPinyinOn && ex.pinyin ? (
                                          <div className="text-[#9aa6ff] text-[14px]">
                                            {ex.pinyin}
                                          </div>
                                        ) : null}
                                        {ex.en ? (
                                          <div className="text-[14px] text-[#8b949e]">
                                            {ex.en}
                                          </div>
                                        ) : null}
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {Array.isArray(story?.tipsRich) && story!.tipsRich!.length > 0 && (
              <div className="mt-4 border border-[#3a3a3a] rounded-lg p-3 bg-[#1e2229]">
                <div className="text-xs font-semibold text-white mb-2">
                  Tips
                </div>
                <ul className="space-y-2 list-disc list-outside pl-4 marker:text-[#596080]">
                  {story!.tipsRich!.slice(0, 4).map((tip, i) => (
                    <li key={i}>
                      {Array.isArray(tip.segments) &&
                      tip.segments.length > 0 ? (
                        <>
                          {renderNotesSegmentsWithPopup(
                            tip.segments,
                            tip.zh,
                            tip.en,
                            notesPinyinOn,
                            { section: "dialogue", noteIndex: i, field: "tip" }
                          )}
                          {tip.en ? (
                            <div className="text-[#8b949e] text-xs">
                              {tip.en}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div className="text-[#c9d1d9]">{tip.zh}</div>
                          {notesPinyinOn ? null : null}
                          {tip.en ? (
                            <div className="text-[#8b949e] text-xs">
                              {tip.en}
                            </div>
                          ) : null}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(dialogue?.tipsRich) &&
              dialogue!.tipsRich!.length > 0 && (
                <div className="mt-4 border border-[#3a3a3a] rounded-lg p-3 bg-[#1e2229]">
                  <div className="text-xs font-semibold text-white mb-2">
                    Tips
                  </div>
                  <ul className="space-y-2 list-disc list-outside pl-4 marker:text-[#596080]">
                    {dialogue!.tipsRich!.slice(0, 4).map((tip, i) => (
                      <li key={i}>
                        {Array.isArray(tip.segments) &&
                        tip.segments.length > 0 ? (
                          <>
                            {renderNotesSegmentsWithPopup(
                              tip.segments,
                              tip.zh,
                              tip.en,
                              notesPinyinOn,
                              { section: "story", noteIndex: i, field: "tip" }
                            )}
                            {tip.en ? (
                              <div className="text-[#8b949e] text-xs">
                                {tip.en}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <div className="text-[#c9d1d9]">{tip.zh}</div>
                            {notesPinyinOn ? null : null}
                            {tip.en ? (
                              <div className="text-[#8b949e] text-xs">
                                {tip.en}
                              </div>
                            ) : null}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Finish lesson action (hide if quiz exists and not finished) */}
            <div className="mt-8 flex justify-center">
              {(() => {
                const dialogueContent = dialogue as unknown as
                  | { quiz?: { items?: unknown[] } }
                  | undefined;
                const storyContent = story as unknown as
                  | { quiz?: { items?: unknown[] } }
                  | undefined;
                const quiz = dialogueContent?.quiz || storyContent?.quiz;
                const hasQuiz = Boolean(
                  quiz && Array.isArray(quiz.items) && quiz.items.length > 0
                );
                if (hasQuiz && !data?.finished) return null;
                return (
                  <button
                    aria-label={
                      data?.finished
                        ? "Lesson finished"
                        : "Mark lesson as finished"
                    }
                    disabled={finishLoading || Boolean(data?.finished)}
                    className={
                      `w-full sm:w-auto px-4 py-2 text-sm rounded-lg font-medium transition-all duration-200 active:scale-[0.98]  disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#222831] ` +
                      (data?.finished
                        ? `bg-green-600 text-white border border-green-500 hover:bg-green-500`
                        : `bg-[#222831] text-white border border-[#404060] hover:border-[#4040f2] shadow-sm`)
                    }
                    onClick={async () => {
                      try {
                        setFinishLoading(true);
                        await lessonsApi.finish(id);
                        setData((prev) =>
                          prev ? { ...prev, finished: true } : prev
                        );
                        toast.success("Marked as finished");
                      } catch {
                        toast.error("Failed to mark as finished");
                      } finally {
                        setFinishLoading(false);
                      }
                    }}
                  >
                    {!data?.finished && finishLoading ? (
                      <svg
                        className="mr-2 inline h-4 w-4 animate-spin text-[#cbd5e1]"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        ></path>
                      </svg>
                    ) : null}
                    {data?.finished ? "Finished ✓" : "Mark lesson as finished"}
                  </button>
                );
              })()}
            </div>

            {popup.open && (
              <div
                ref={popupRef}
                style={{
                  position: "absolute",
                  left: popupPos ? popupPos.left : popup.x,
                  top: popupPos ? popupPos.top : popup.y,
                  zIndex: 10,
                  visibility: popupPos ? "visible" : "hidden",
                  transform: popupPos
                    ? "none"
                    : "translate(-50%, calc(-100% - 8px))",
                }}
                className="bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-white text-lg truncate">
                    {popup.word}
                  </div>
                  {typeof popup.hskLevel === "number" && (
                    <span
                      className={`text-[10px] leading-none px-2 py-[2px] rounded-full ${getHSKPillClasses(
                        popup.hskLevel
                      )}`}
                      aria-label={`HSK level ${popup.hskLevel}`}
                    >
                      HSK {popup.hskLevel}
                    </span>
                  )}
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
                      } else if (dialogue) {
                        // Fallback for dialogue popup (no para/token indices): use the turn containing the word
                        const found = (dialogue.turns || []).find((t) =>
                          t.hanzi?.includes(popup.word)
                        );
                        if (found) {
                          let perCharPinyin: string | undefined = found.pinyin;
                          if (!perCharPinyin && Array.isArray(found.segments)) {
                            const chars = Array.from(found.hanzi || "");
                            const per: string[] = new Array(chars.length).fill(
                              ""
                            );
                            let ci = 0;
                            for (const s of found.segments) {
                              const chineseLen = Array.from(
                                s.text || ""
                              ).filter((c) => /[\u3400-\u9FFF]/.test(c)).length;
                              const toks = (s.pinyin || "")
                                .split(/\s+/)
                                .filter(Boolean);
                              for (let k = 0; k < chineseLen; k++) {
                                while (
                                  ci < chars.length &&
                                  !/[\u3400-\u9FFF]/.test(chars[ci])
                                )
                                  ci++;
                                if (ci >= chars.length) break;
                                per[ci] = toks[k] || toks[0] || "";
                                ci++;
                              }
                            }
                            perCharPinyin = per.join(" ");
                          }
                          ctx = {
                            hanzi: found.hanzi,
                            pinyin: perCharPinyin,
                            translation: found.translation,
                          };
                        }
                      }
                      // Derive vocab metadata from popup/segment
                      let vocabDef: string | undefined = undefined;
                      if (
                        Array.isArray(popup.definitions) &&
                        popup.definitions.length > 0
                      ) {
                        vocabDef = popup.definitions[0];
                      } else if (popup.definition) {
                        vocabDef = popup.definition;
                      }
                      let vocabHskLevel: number | undefined = undefined;
                      if (
                        typeof popup.paraIndex === "number" &&
                        typeof popup.tokenIndex === "number"
                      ) {
                        const seg = (segmentedParagraphs[popup.paraIndex] ||
                          [])[popup.tokenIndex] as LessonToken | undefined;
                        if (seg && typeof seg.hskLevel === "number") {
                          vocabHskLevel = seg.hskLevel;
                        }
                      }
                      void addSingleToFlashcards(popup.word, ctx, {
                        pinyin: popup.pinyin,
                        definition: vocabDef,
                        hskLevel: vocabHskLevel,
                      });
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

            {notesPopup.open && (
              <div
                ref={notesPopupRef}
                style={{
                  position: "absolute",
                  left: notesPopupPos ? notesPopupPos.left : notesPopup.x,
                  top: notesPopupPos ? notesPopupPos.top : notesPopup.y,
                  zIndex: 10,
                  visibility: notesPopupPos ? "visible" : "hidden",
                  transform: notesPopupPos
                    ? "none"
                    : "translate(-50%, calc(-100% - 8px))",
                }}
                className="bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-white text-lg truncate">
                    {notesPopup.word}
                  </div>
                  {typeof notesPopup.hskLevel === "number" && (
                    <span
                      className={`text-[10px] leading-none px-2 py-[2px] rounded-full ${getHSKPillClasses(
                        notesPopup.hskLevel
                      )}`}
                      aria-label={`HSK level ${notesPopup.hskLevel}`}
                    >
                      HSK {notesPopup.hskLevel}
                    </span>
                  )}
                </div>
                {notesPopup.pinyin && (
                  <div className="text-[#c6ceff] text-sm font-medium truncate">
                    {notesPopup.pinyin}
                  </div>
                )}
                {Array.isArray(notesPopup.definitions) &&
                notesPopup.definitions.length > 0 ? (
                  <div className="text-xs text-[#a6a6a6] mt-2 space-y-1">
                    {notesPopup.definitions.map((d, i) => (
                      <div key={i}>• {d}</div>
                    ))}
                  </div>
                ) : notesPopup.definition ? (
                  <div className="text-xs text-[#a6a6a6] mt-2">
                    {notesPopup.definition}
                  </div>
                ) : null}
                <div className="mt-3 pt-3 border-t border-[#404040]">
                  <button
                    onClick={async () => {
                      // Create context from the notes popup data
                      const ctx = {
                        hanzi: notesPopup.word,
                        pinyin: notesPopup.pinyin,
                        translation:
                          notesPopup.definition ||
                          (Array.isArray(notesPopup.definitions) &&
                          notesPopup.definitions.length > 0
                            ? notesPopup.definitions[0]
                            : undefined),
                      };

                      // Derive vocab metadata from popup
                      let vocabDef: string | undefined = undefined;
                      if (
                        Array.isArray(notesPopup.definitions) &&
                        notesPopup.definitions.length > 0
                      ) {
                        vocabDef = notesPopup.definitions[0];
                      } else if (notesPopup.definition) {
                        vocabDef = notesPopup.definition;
                      }

                      void addSingleToFlashcards(notesPopup.word, ctx, {
                        pinyin: notesPopup.pinyin,
                        definition: vocabDef,
                        hskLevel: undefined, // Notes don't have HSK level info
                      });
                      setNotesPopup((p) => ({ ...p, open: false }));
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

// Quiz view for lesson-generated quizzes (does not reveal correct on wrong)
function LessonQuizView({
  quiz,
  disabled,
  onAddFlashcard,
  onPerfectScore,
}: {
  quiz: {
    items?: Array<{
      question: {
        zh: string;
        translation?: string;
        segments?: Array<{
          text: string;
          isWord?: boolean;
          pinyin?: string;
          definition?: string;
          definitions?: string[];
          hskLevel?: number;
        }>;
      };
      options?: Array<{
        zh: string;
        translation?: string;
        segments?: Array<{
          text: string;
          isWord?: boolean;
          pinyin?: string;
          definition?: string;
          definitions?: string[];
          hskLevel?: number;
        }>;
      }>;
      answerIndex?: number;
      rationale?: string;
    }>;
    passingScore?: number;
  };
  disabled?: boolean;
  onAddFlashcard?: (
    hanzi: string,
    context?: { hanzi?: string; pinyin?: string; translation?: string },
    vocab?: { pinyin?: string; definition?: string; hskLevel?: number }
  ) => void;
  onPerfectScore: () => void | Promise<void>;
}) {
  const items = Array.isArray(quiz?.items) ? quiz.items : [];
  const [selected, setSelected] = useState<Record<number, number | null>>({});
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [result, setResult] = useState<{
    correct: boolean[];
    score: number;
  } | null>(null);
  const [showPinyin, setShowPinyin] = useState<boolean>(false);
  const [showTranslation, setShowTranslation] = useState<boolean>(false);
  const completed = Boolean(disabled);

  const toggle = (qi: number, oi: number) => {
    if (submitted || disabled) return;
    setSelected((prev) => ({ ...prev, [qi]: prev[qi] === oi ? null : oi }));
  };

  const onSubmit = async () => {
    const answers = items.map((_, i) => selected[i] ?? null);
    const correct = items.map((it, i) =>
      typeof it.answerIndex === "number" ? answers[i] === it.answerIndex : false
    );
    const score = Math.round(
      (correct.filter(Boolean).length / Math.max(1, items.length)) * 100
    );
    setResult({ correct, score });
    setSubmitted(true);
    if (score === 100) {
      await onPerfectScore();
    }
  };

  const onRetry = () => {
    setSelected({});
    setSubmitted(false);
    setResult(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <div className="min-w-0">
          <h3 className="text-white font-semibold">Quiz</h3>
          <p className="text-white/70 text-xs">
            {items.length} questions • Choose the best answer
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {completed && (
            <span className="px-2 py-1 text-xs rounded bg-green-500/15 text-green-300 border border-green-500/30">
              Completed
            </span>
          )}
          <button
            onClick={() => setShowPinyin((v) => !v)}
            className={`px-2 py-1 text-xs rounded border ${showPinyin ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer`}
            type="button"
            aria-pressed={showPinyin}
            aria-label={showPinyin ? "Hide pinyin" : "Show pinyin"}
          >
            Pinyin {showPinyin ? "On" : "Off"}
          </button>
          <button
            onClick={() => setShowTranslation((v) => !v)}
            className={`px-2 py-1 text-xs rounded border ${showTranslation ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer`}
            type="button"
            aria-pressed={showTranslation}
            aria-label={
              showTranslation ? "Hide translations" : "Show translations"
            }
          >
            <span className="sr-only">Translation</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 26 25"
              fill="none"
              aria-hidden="true"
              className="inline-block align-middle"
            >
              <path
                d="M1 3.46154H9.61539M9.61539 3.46154H15.1539M9.61539 3.46154V1M18.2308 3.46154H15.1539M15.1539 3.46154C14.144 6.82785 12.0292 10.01 9.61539 12.8066M9.61539 12.8066C7.61662 15.1223 5.41282 17.1737 3.46154 18.8462M9.61539 12.8066C8.38462 11.4615 6.41539 8.75385 5.92308 7.76923M9.61539 12.8066L13.3077 16.3846"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M15.1538 23.1538L16.5605 19.4615M16.5605 19.4615L20.0769 10.2307L23.5933 19.4615M16.5605 19.4615H23.5933M25 23.1538L23.5933 19.4615"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {items.map((it, i) => {
          const choice = selected[i] ?? null;
          const showState =
            (submitted || completed) && typeof it.answerIndex === "number";
          const isCorrect = showState && choice === it.answerIndex;
          const isIncorrect =
            showState && choice !== null && choice !== it.answerIndex;
          return (
            <div
              key={i}
              className={`relative p-4 border border-white/10 rounded-xl bg-white/[0.02] hover:border-white/20 transition-all duration-200 ${
                isCorrect
                  ? "border-green-500/30 bg-green-500/5"
                  : isIncorrect
                    ? "border-red-500/30 bg-red-500/5"
                    : ""
              }`}
            >
              <div className="mb-3 text-white">
                <InlineSegments
                  segments={it.question?.segments}
                  fallbackZh={it.question?.zh}
                  showPinyin={showPinyin}
                  contextSentenceZh={it.question?.zh}
                  contextSentenceTranslation={it.question?.translation}
                  onAddFlashcard={onAddFlashcard}
                />
                {showTranslation && it.question?.translation ? (
                  <div className="text-white/60 text-xs mt-1 italic">
                    {it.question.translation}
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                {(it.options || []).map((opt, j) => {
                  const selectedNow = choice === j;
                  const correctChoice = showState && it.answerIndex === j;
                  const incorrectChosen =
                    showState && selectedNow && !correctChoice;
                  return (
                    <div
                      key={j}
                      onClick={() => toggle(i, j)}
                      aria-disabled={submitted || disabled}
                      tabIndex={submitted || disabled ? -1 : 0}
                      role="button"
                      onKeyDown={(e) => {
                        if (submitted || disabled) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle(i, j);
                        }
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
                        submitted || disabled
                          ? "cursor-default"
                          : "cursor-pointer"
                      } ${
                        // Force green highlight for correct option when completed
                        completed && correctChoice
                          ? "border-green-500/50 bg-green-500/10 text-green-100"
                          : selectedNow
                            ? showState
                              ? isCorrect
                                ? "border-green-500/50 bg-green-500/10 text-green-100"
                                : incorrectChosen
                                  ? "border-red-500/50 bg-red-500/10 text-red-100"
                                  : "border-blue-500/50 bg-blue-500/10 text-blue-100"
                              : "border-blue-500/50 bg-blue-500/10 text-white"
                            : `border-white/10 bg-white/5 text-white/90${disabled ? "" : " hover:border-white/30 hover:bg-white/5"}`
                      } ${selectedNow && !disabled ? "hover:border-blue-500/50 hover:bg-blue-500/10" : ""}`}
                    >
                      <div className="text-sm text-white">
                        <InlineSegments
                          segments={opt.segments}
                          fallbackZh={opt.zh}
                          showPinyin={showPinyin}
                          hoverClass="hover:bg-white/15"
                          contextSentenceZh={opt.zh}
                          contextSentenceTranslation={opt.translation}
                          onAddFlashcard={onAddFlashcard}
                        />
                        {showTranslation && opt.translation ? (
                          <div className="text-white/60 text-xs mt-1">
                            {opt.translation}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        {completed ? (
          <div className="w-full">
            <div className="relative overflow-hidden rounded-xl border border-green-500/40 bg-gradient-to-r from-green-600/20 via-green-500/15 to-emerald-500/15 p-4">
              <div
                className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-green-500/10 blur-2xl"
                aria-hidden="true"
              />
              <div className="flex items-center gap-3 text-green-200">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600/30 border border-green-500/40">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M9 12l2 2 4-4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold tracking-tight text-green-300">
                    Perfect score! Lesson completed
                  </div>
                  <div className="text-sm text-green-200/80">
                    Score: 100% • Great job—quiz is now locked
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : result ? (
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${result.score === 100 ? "bg-green-500/15 text-green-300 border-green-500/40" : "bg-white/5 text-white/80 border-white/20"}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M21 10l-6-6M3 10l6-6m6 16l6-6M9 20l-6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="font-semibold">Score: {result.score}%</span>
            </span>
          </div>
        ) : (
          <div className="text-white/70 text-xs">
            {Object.keys(selected).length} / {items.length} answered
          </div>
        )}
        {!completed && (
          <div className="flex items-center gap-2">
            {!submitted ? (
              <button
                type="button"
                onClick={onSubmit}
                disabled={Object.keys(selected).length !== items.length}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
              >
                Submit
              </button>
            ) : (
              <button
                type="button"
                onClick={onRetry}
                className="px-4 py-2 border border-white/20 text-white rounded-lg hover:bg-white/5 transition-colors duration-200 cursor-pointer text-sm"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InlineSegments({
  segments,
  fallbackZh,
  showPinyin,
  hoverClass,
  contextSentenceZh,
  contextSentenceTranslation,
  onAddFlashcard,
}: {
  segments?: Array<{
    text: string;
    isWord?: boolean;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    hskLevel?: number;
  }>;
  fallbackZh?: string;
  showPinyin?: boolean;
  hoverClass?: string;
  contextSentenceZh?: string;
  contextSentenceTranslation?: string;
  onAddFlashcard?: (
    hanzi: string,
    context?: { hanzi?: string; pinyin?: string; translation?: string },
    vocab?: { pinyin?: string; definition?: string; hskLevel?: number }
  ) => void;
}) {
  const [popup, setPopup] = useState<{
    open: boolean;
    x: number;
    y: number;
    anchorH?: number;
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    hskLevel?: number;
  }>({ open: false, x: 0, y: 0, word: "" });
  const popupRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [popupPos, setPopupPos] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopup((p) => ({ ...p, open: false }));
      }
    };
    if (popup.open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [popup.open]);

  useEffect(() => {
    if (!popup.open) {
      setPopupPos(null);
      return;
    }
    const modal = popupRef.current;
    const container = contentRef.current;
    if (!modal || !container) return;
    const modalRect = modal.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    const margin = 8;
    const contW = contRect.width;
    const contH = contRect.height;
    const toolbar = document.querySelector(
      '[role="toolbar"][aria-label="Lesson controls"]'
    ) as HTMLElement | null;
    const toolbarRect = toolbar?.getBoundingClientRect();
    const toolbarBottom = toolbarRect ? toolbarRect.bottom : 0;
    const visibleTopInContainer = Math.max(0, toolbarBottom - contRect.top);
    const visibleBottomInContainer = Math.min(
      contH,
      Math.max(0, window.innerHeight - contRect.top)
    );
    let left = popup.x - modalRect.width / 2;
    left = Math.max(margin, Math.min(left, contW - modalRect.width - margin));
    const anchorH = popup.anchorH || 0;
    const availableAbove = popup.y - visibleTopInContainer - margin;
    const availableBelow =
      visibleBottomInContainer - (popup.y + anchorH) - margin;
    let top: number;
    if (modalRect.height <= availableAbove || availableBelow < 0) {
      top = Math.max(
        visibleTopInContainer + margin,
        popup.y - modalRect.height - margin
      );
    } else if (modalRect.height <= availableBelow || availableAbove < 0) {
      top = Math.min(
        visibleBottomInContainer - modalRect.height - margin,
        popup.y + anchorH + margin
      );
    } else {
      top = Math.min(
        visibleBottomInContainer - modalRect.height - margin,
        Math.max(visibleTopInContainer + margin, popup.y + anchorH + margin)
      );
    }
    setPopupPos({ left, top });
  }, [popup.open, popup.x, popup.y, popup.anchorH]);

  return (
    <div className="relative" ref={contentRef}>
      <div className="leading-7 text-white">
        {Array.isArray(segments) && segments.length > 0
          ? segments.map((seg, idx) => {
              const isWord = Boolean(seg.isWord);
              return (
                <span
                  key={idx}
                  className="inline-flex flex-col items-center align-top mr-[2px]"
                >
                  {showPinyin ? (
                    isWord && seg.pinyin ? (
                      <span className="text-[10px] text-[#9aa6ff] leading-none mb-[2px]">
                        {seg.pinyin}
                      </span>
                    ) : (
                      <span className="text-[10px] opacity-0 leading-none mb-[2px] select-none">
                        •
                      </span>
                    )
                  ) : null}
                  <span
                    className={`px-[1px] rounded ${isWord ? `${hoverClass || "hover:bg-[#404040]"} cursor-pointer` : ""}`}
                    title={seg.definition || ""}
                    onClick={(e) => {
                      if (!isWord) return;
                      const anchor = (
                        e.currentTarget as HTMLSpanElement
                      ).getBoundingClientRect();
                      const container =
                        contentRef.current?.getBoundingClientRect();
                      const px = container
                        ? anchor.left - container.left + anchor.width / 2
                        : e.clientX;
                      const py = container
                        ? anchor.top - container.top
                        : e.clientY;
                      setPopup({
                        open: true,
                        x: px,
                        y: py,
                        anchorH: anchor.height,
                        word: seg.text,
                        pinyin: seg.pinyin,
                        definition: seg.definition,
                        definitions: seg.definitions,
                        hskLevel: (seg as unknown as { hskLevel?: number })
                          ?.hskLevel,
                      });
                    }}
                  >
                    {seg.text}
                  </span>
                </span>
              );
            })
          : fallbackZh}
      </div>
      {popup.open && (
        <div
          ref={popupRef}
          style={{
            position: "absolute",
            left: popupPos ? popupPos.left : popup.x,
            top: popupPos ? popupPos.top : popup.y,
            zIndex: 10,
            visibility: popupPos ? "visible" : "hidden",
            transform: popupPos ? "none" : "translate(-50%, calc(-100% - 8px))",
          }}
          className="bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="font-bold text-white text-lg truncate">
              {popup.word}
            </div>
            {typeof popup.hskLevel === "number" && (
              <span
                className={`text-[10px] leading-none px-2 py-[2px] rounded-full ${getHSKPillClasses(
                  popup.hskLevel as number
                )}`}
                aria-label={`HSK level ${popup.hskLevel}`}
              >
                HSK {popup.hskLevel}
              </span>
            )}
          </div>
          {popup.pinyin && (
            <div className="text-[#c6ceff] text-sm font-medium truncate">
              {popup.pinyin}
            </div>
          )}
          {Array.isArray(popup.definitions) && popup.definitions.length > 0 ? (
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
                const ctx = {
                  hanzi: contextSentenceZh || fallbackZh,
                  pinyin: undefined,
                  translation: contextSentenceTranslation,
                };
                const vocabDef = Array.isArray(popup.definitions)
                  ? popup.definitions[0]
                  : popup.definition;
                onAddFlashcard?.(popup.word, ctx, {
                  pinyin: popup.pinyin,
                  definition: vocabDef,
                  hskLevel: popup.hskLevel,
                });
                setPopup((p) => ({ ...p, open: false }));
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer"
              type="button"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-inter">Add to Flashcards</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
