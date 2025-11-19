"use client";

import {
  useEffect,
  useMemo,
  useState,
  useRef,
  useReducer,
  useCallback,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout";
import {
  lessonsApi,
  type LessonDetail,
  type LessonAccess,
} from "@/lib/api/lessons";
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
import { useLessonData } from "@/hooks/useLessonData";
import { StorySection } from "@/components/lessons/StorySection";
import { DialogueSection } from "@/components/lessons/DialogueSection";
import { NotesSection } from "@/components/lessons/NotesSection";
import type { TokenRendererProps } from "@/components/lessons/TokenRenderer";
import { QuizSection } from "@/components/lessons/QuizSection";
import { usePopup } from "@/hooks/usePopup";
import { useMultiSelect } from "@/hooks/useMultiSelect";

export default function LessonViewerPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params?.id);
  const [data, setData] = useState<LessonDetail | null>(null);
  const lessonQuery = useLessonData(Number.isFinite(id) ? id : null);
  const loading = lessonQuery.isFetching || lessonQuery.isLoading;
  const error = lessonQuery.error ? (lessonQuery.error as Error).message : null;
  useEffect(() => {
    if (lessonQuery.data) setData(lessonQuery.data);
  }, [lessonQuery.data]);

  const access: LessonAccess =
    data?.access === "preview" || data?.access === "full"
      ? data.access
      : "full";
  const unlockInfo = data?.unlockInfo;

  const visibleSections = useMemo(() => {
    if (!data) return [];
    if (
      access === "preview" &&
      Array.isArray(data.sectionsPreview) &&
      data.sectionsPreview.length > 0
    ) {
      return data.sectionsPreview;
    }
    return data.sections ?? [];
  }, [data, access]);

  const isPreview = access === "preview";

  // Phase 2: Consolidated UI state via useReducer
  type SelectedWord = {
    text: string;
    pinyin?: string;
    paraIndex?: number;
    tokenIndex?: number;
    contextZh?: string;
    contextEn?: string;
  };

  type UIState = {
    showPinyin: boolean;
    showTranslation: boolean;
    chunkPinyinOn: Record<number, boolean | null>;
    chunkTransOn: Record<number, boolean | null>;
    turnPinyinOn: Record<number, boolean | null>;
    turnTransOn: Record<number, boolean | null>;
    multiSelect: boolean;
    selectedWords: Record<string, SelectedWord>;
    isHeaderVisible: boolean;
    isContentChanging: boolean;
  };

  type UIAction =
    | { type: "setShowPinyin"; value: boolean }
    | { type: "setShowTranslation"; value: boolean }
    | { type: "setChunkPinyin"; value: Record<number, boolean | null> }
    | { type: "setChunkTrans"; value: Record<number, boolean | null> }
    | { type: "setTurnPinyin"; value: Record<number, boolean | null> }
    | { type: "setTurnTrans"; value: Record<number, boolean | null> }
    | { type: "setMultiSelect"; value: boolean }
    | { type: "setSelectedWords"; value: Record<string, SelectedWord> }
    | { type: "setHeaderVisible"; value: boolean }
    | { type: "setContentChanging"; value: boolean };

  const initialUIState: UIState = {
    showPinyin: false,
    showTranslation: false,
    chunkPinyinOn: {},
    chunkTransOn: {},
    turnPinyinOn: {},
    turnTransOn: {},
    multiSelect: false,
    selectedWords: {},
    isHeaderVisible: true,
    isContentChanging: false,
  };

  function uiReducer(state: UIState, action: UIAction): UIState {
    switch (action.type) {
      case "setShowPinyin":
        return { ...state, showPinyin: action.value };
      case "setShowTranslation":
        return { ...state, showTranslation: action.value };
      case "setChunkPinyin":
        return { ...state, chunkPinyinOn: action.value };
      case "setChunkTrans":
        return { ...state, chunkTransOn: action.value };
      case "setTurnPinyin":
        return { ...state, turnPinyinOn: action.value };
      case "setTurnTrans":
        return { ...state, turnTransOn: action.value };
      case "setMultiSelect":
        return { ...state, multiSelect: action.value };
      case "setSelectedWords":
        return { ...state, selectedWords: action.value };
      case "setHeaderVisible":
        return { ...state, isHeaderVisible: action.value };
      case "setContentChanging":
        return { ...state, isContentChanging: action.value };
      default:
        return state;
    }
  }

  const [ui, dispatchUI] = useReducer(uiReducer, initialUIState);

  // Backwards-compatible variables and setters (preserve existing names/usage)
  const showPinyin = ui.showPinyin;
  const setShowPinyin = (v: boolean | ((prev: boolean) => boolean)) =>
    dispatchUI({
      type: "setShowPinyin",
      value:
        typeof v === "function"
          ? (v as (p: boolean) => boolean)(ui.showPinyin)
          : v,
    });

  const showTranslation = ui.showTranslation;
  const setShowTranslation = (v: boolean | ((prev: boolean) => boolean)) =>
    dispatchUI({
      type: "setShowTranslation",
      value:
        typeof v === "function"
          ? (v as (p: boolean) => boolean)(ui.showTranslation)
          : v,
    });

  const chunkPinyinOn = ui.chunkPinyinOn;
  const setChunkPinyinOn = (
    next:
      | Record<number, boolean | null>
      | ((s: Record<number, boolean | null>) => Record<number, boolean | null>)
  ) =>
    dispatchUI({
      type: "setChunkPinyin",
      value:
        typeof next === "function"
          ? (next as (s: UIState["chunkPinyinOn"]) => UIState["chunkPinyinOn"])(
              ui.chunkPinyinOn
            )
          : next,
    });

  const chunkTransOn = ui.chunkTransOn;
  const setChunkTransOn = (
    next:
      | Record<number, boolean | null>
      | ((s: Record<number, boolean | null>) => Record<number, boolean | null>)
  ) =>
    dispatchUI({
      type: "setChunkTrans",
      value:
        typeof next === "function"
          ? (next as (s: UIState["chunkTransOn"]) => UIState["chunkTransOn"])(
              ui.chunkTransOn
            )
          : next,
    });

  const turnPinyinOn = ui.turnPinyinOn;
  const setTurnPinyinOn = (
    next:
      | Record<number, boolean | null>
      | ((s: Record<number, boolean | null>) => Record<number, boolean | null>)
  ) =>
    dispatchUI({
      type: "setTurnPinyin",
      value:
        typeof next === "function"
          ? (next as (s: UIState["turnPinyinOn"]) => UIState["turnPinyinOn"])(
              ui.turnPinyinOn
            )
          : next,
    });

  const turnTransOn = ui.turnTransOn;
  const setTurnTransOn = (
    next:
      | Record<number, boolean | null>
      | ((s: Record<number, boolean | null>) => Record<number, boolean | null>)
  ) =>
    dispatchUI({
      type: "setTurnTrans",
      value:
        typeof next === "function"
          ? (next as (s: UIState["turnTransOn"]) => UIState["turnTransOn"])(
              ui.turnTransOn
            )
          : next,
    });

  const multiSelect = ui.multiSelect;
  const setMultiSelect = (v: boolean | ((prev: boolean) => boolean)) =>
    dispatchUI({
      type: "setMultiSelect",
      value:
        typeof v === "function"
          ? (v as (p: boolean) => boolean)(ui.multiSelect)
          : v,
    });

  const uiSelectedWords = ui.selectedWords;

  const setSelectedWords = (
    next:
      | Record<string, SelectedWord>
      | ((s: Record<string, SelectedWord>) => Record<string, SelectedWord>)
  ) =>
    dispatchUI({
      type: "setSelectedWords",
      value:
        typeof next === "function"
          ? (next as (s: UIState["selectedWords"]) => UIState["selectedWords"])(
              ui.selectedWords
            )
          : next,
    });
  // Multi-select helpers built over existing reducer state
  const ms = useMultiSelect<string, SelectedWord>({
    selected: uiSelectedWords,
    setSelected: setSelectedWords,
    mode: multiSelect ? "multi" : "single",
  });
  const selectedWords = uiSelectedWords;
  const [finishLoading, setFinishLoading] = useState(false);

  // Scroll-aware header state
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isContentChanging, setIsContentChanging] = useState(false);
  const scrollThreshold = 50; // Hide after scrolling down 30px
  const showThreshold = 30; // Show when scrolling up 20px
  const minScrollDelta = 10; // Minimum scroll delta to trigger direction change

  // refetch on id change handled by queryKey inside useLessonData

  // Scroll detection for header auto-hide
  useEffect(() => {
    const handleScroll = () => {
      // Only enable auto-hide on mobile; keep header always visible on desktop
      const isDesktop =
        typeof window !== "undefined" ? window.innerWidth >= 640 : false;
      if (isDesktop) {
        if (!isHeaderVisible) setIsHeaderVisible(true);
        setLastScrollY(0);
        return;
      }
      // The scroll is happening on the main element, not window
      const mainElement = document.querySelector("main");
      const currentScrollY = mainElement?.scrollTop || 0;

      // Ignore scroll events during content changes
      if (isContentChanging) {
        return;
      }

      // Don't hide header if we're at the top
      if (currentScrollY < 10) {
        setIsHeaderVisible(true);
        setLastScrollY(currentScrollY);
        return;
      }

      // Don't hide header during multi-select mode
      if (multiSelect) {
        setIsHeaderVisible(true);
        setLastScrollY(currentScrollY);
        return;
      }

      // Determine scroll direction (only if there's significant movement)
      const scrollDelta = currentScrollY - lastScrollY;

      if (scrollDelta > minScrollDelta) {
        // Scrolling down significantly
        if (currentScrollY > scrollThreshold) {
          setIsHeaderVisible(false);
        } else {
        }
      } else if (scrollDelta < -minScrollDelta) {
        // Scrolling up significantly
        if (currentScrollY > showThreshold) {
          setIsHeaderVisible(true);
        } else {
        }
      } else {
      }
      // If scrollDelta is within [-minScrollDelta, minScrollDelta], ignore small movements

      setLastScrollY(currentScrollY);
    };

    // Find the main scrollable element
    const mainElement = document.querySelector("main");

    if (mainElement) {
      // Listen to the main element's scroll events
      mainElement.addEventListener("scroll", handleScroll, { passive: true });

      return () => {
        mainElement.removeEventListener("scroll", handleScroll);
      };
    } else {
      console.log("Main element not found, falling back to window scroll");
      // Fallback to window scroll
      window.addEventListener("scroll", handleScroll, { passive: true });

      return () => {
        window.removeEventListener("scroll", handleScroll);
      };
    }
  }, [
    lastScrollY,
    multiSelect,
    scrollThreshold,
    showThreshold,
    minScrollDelta,
    isHeaderVisible,
    isContentChanging,
  ]);

  // Ensure header is visible on desktop when resizing between breakpoints
  useEffect(() => {
    const onResize = () => {
      if (typeof window !== "undefined" && window.innerWidth >= 640) {
        setIsHeaderVisible(true);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Tap to show header when hidden
  const handleTapToShowHeader = () => {
    if (!isHeaderVisible) {
      setIsHeaderVisible(true);
    }
  };

  const storySection = useMemo(
    () => visibleSections.find((s) => s.sectionType === "story"),
    [visibleSections]
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
    () => visibleSections.find((s) => s.sectionType === "dialogue"),
    [visibleSections]
  );

  const accessBanner = useMemo(() => {
    if (access === "full") return null;
    const message =
      unlockInfo?.reason === "community_quota_exceeded"
        ? "You've used your 10 free full community lessons for this period. You're seeing a preview of this lesson."
        : "This community lesson is preview-only on your current plan.";

    return (
      <div
        className="mb-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-50"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold text-amber-50/90">{message}</p>
            <p className="mt-1 text-amber-100/80 text-sm">
              Upgrade to Basic or Premium for full access to all user-generated
              lessons (all HSK levels).
            </p>
          </div>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black shadow hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0e13]"
          >
            View plans
          </Link>
        </div>
      </div>
    );
  }, [access, unlockInfo]);
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

  // Shared content container reference (used for popup positioning)
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Popup using reusable hook (behavior preserved)
  type MainPopupData = {
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    paraIndex?: number;
    tokenIndex?: number;
    hskLevel?: number;
  };
  const {
    popupRef,
    state: popup,
    position: popupPos,
    openWithParams: openMainPopupWithParams,
    openFromElement: openMainPopupFromElement,
    close: closeMainPopup,
  } = usePopup<MainPopupData>({ containerRef: contentRef });

  // Backward-compatible setter used by child sections
  type LegacyPopup = {
    open: boolean;
    x: number;
    y: number;
    anchorH?: number;
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    paraIndex?: number;
    tokenIndex?: number;
    hskLevel?: number;
  };

  const setPopup: React.Dispatch<React.SetStateAction<LegacyPopup>> =
    useCallback(
      (next) => {
        const toCore = (
          legacy: LegacyPopup | null | undefined
        ): import("@/hooks/usePopup").PopupCoreState<MainPopupData> | null => {
          if (!legacy || !legacy.open) return null;
          const {
            x,
            y,
            anchorH,
            word,
            pinyin,
            definition,
            definitions,
            paraIndex,
            tokenIndex,
            hskLevel,
          } = legacy;
          return {
            open: true,
            x,
            y,
            anchorH,
            data: {
              word,
              pinyin,
              definition,
              definitions,
              paraIndex,
              tokenIndex,
              hskLevel,
            },
          };
        };

        if (typeof next === "function") {
          const legacyPrev: LegacyPopup = {
            open: popup.open,
            x: popup.x,
            y: popup.y,
            anchorH: popup.anchorH,
            word: popup.data?.word ?? "",
            pinyin: popup.data?.pinyin,
            definition: popup.data?.definition,
            definitions: popup.data?.definitions,
            paraIndex: popup.data?.paraIndex,
            tokenIndex: popup.data?.tokenIndex,
            hskLevel: popup.data?.hskLevel,
          };
          const computed = (next as (prev: LegacyPopup) => LegacyPopup)(
            legacyPrev
          );
          const core = toCore(computed);
          if (core) openMainPopupWithParams(core);
          else closeMainPopup();
        } else {
          const core = toCore(next as LegacyPopup);
          if (core) openMainPopupWithParams(core);
          else closeMainPopup();
        }
      },
      [popup, openMainPopupWithParams, closeMainPopup]
    );

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
    tokenIndex: number,
    contextZh?: string,
    contextEn?: string
  ) => {
    ms.toggle(key, {
      text,
      pinyin,
      paraIndex,
      tokenIndex,
      contextZh,
      contextEn,
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
          // For notes words, use the full note context when available
          sentenceCtx = {
            hanzi: w.contextZh ?? w.text,
            pinyin: undefined,
            translation: w.contextEn,
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

  type NotesPopupData = {
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    hskLevel?: number;
    contextZh?: string;
    contextEn?: string;
  };
  const {
    popupRef: notesPopupRef,
    state: notesPopup,
    position: notesPopupPos,
    openWithParams: openNotesPopupWithParams,
    close: closeNotesPopup,
  } = usePopup<NotesPopupData>({ containerRef: contentRef });

  type LegacyNotesPopup = {
    open: boolean;
    x: number;
    y: number;
    anchorH?: number;
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    hskLevel?: number;
    contextZh?: string;
    contextEn?: string;
  };
  const setNotesPopup: React.Dispatch<React.SetStateAction<LegacyNotesPopup>> =
    useCallback(
      (next) => {
        const toCore = (
          legacy: LegacyNotesPopup | null | undefined
        ): import("@/hooks/usePopup").PopupCoreState<NotesPopupData> | null => {
          if (!legacy || !legacy.open) return null;
          const {
            x,
            y,
            anchorH,
            word,
            pinyin,
            definition,
            definitions,
            hskLevel,
            contextZh,
            contextEn,
          } = legacy;
          return {
            open: true,
            x,
            y,
            anchorH,
            data: {
              word,
              pinyin,
              definition,
              definitions,
              hskLevel,
              contextZh,
              contextEn,
            },
          };
        };
        if (typeof next === "function") {
          const legacyPrev: LegacyNotesPopup = {
            open: notesPopup.open,
            x: notesPopup.x,
            y: notesPopup.y,
            anchorH: notesPopup.anchorH,
            word: notesPopup.data?.word ?? "",
            pinyin: notesPopup.data?.pinyin,
            definition: notesPopup.data?.definition,
            definitions: notesPopup.data?.definitions,
            hskLevel: notesPopup.data?.hskLevel,
            contextZh: notesPopup.data?.contextZh,
            contextEn: notesPopup.data?.contextEn,
          };
          const computed = (
            next as (prev: LegacyNotesPopup) => LegacyNotesPopup
          )(legacyPrev);
          const core = toCore(computed);
          if (core) openNotesPopupWithParams(core);
          else closeNotesPopup();
        } else {
          const core = toCore(next as LegacyNotesPopup);
          if (core) openNotesPopupWithParams(core);
          else closeNotesPopup();
        }
      },
      [notesPopup, openNotesPopupWithParams, closeNotesPopup]
    );

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
          <div className="text-[color:var(--text-subtle)]">{fallbackZh}</div>
          {showPinyin && (
            <div className="text-[color:var(--text-accent)] text-xs">
              {fallbackEn}
            </div>
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
                  <span className="text-[10px] text-[color:var(--text-accent)] leading-none mb-[2px]">
                    {seg.pinyin}
                  </span>
                ) : (
                  <span className="text-[10px] opacity-0 leading-none mb-[2px] select-none">
                    •
                  </span>
                )
              ) : null}
              <span
                className={`px-[1px] rounded ${isWord ? "hover:bg-[color:var(--border-strong)] cursor-pointer" : ""}`}
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
                      idx,
                      fallbackZh,
                      fallbackEn
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
                    contextZh: fallbackZh,
                    contextEn: fallbackEn,
                  });
                }}
              >
                <span
                  className={`flex ${
                    multiSelect &&
                    notesContext &&
                    selectedWords[
                      `notes-${notesContext.section}-${notesContext.noteIndex}-${notesContext.field}${notesContext.exampleIndex !== undefined ? `-${notesContext.exampleIndex}` : ""}-${idx}-${seg.text}`
                    ]
                      ? "bg-[var(--color-accent-blue)]/80 rounded"
                      : undefined
                  }`}
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
      <div className="p-2 sm:p-6 sm:pt-0 pt-0 space-y-6">
        <motion.div
          className="flex flex-wrap items-center justify-between gap-2 sticky top-0 z-20 -mx-6 px-6 py-2 bg-[color:var(--surface-main-80)] backdrop-blur border-b border-[color:var(--border-header)]"
          role="toolbar"
          aria-label="Lesson controls"
          initial={{ y: 0 }}
          animate={{ y: isHeaderVisible ? 0 : -100 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            duration: 0.3,
          }}
        >
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
            <button
              onClick={() => router.push("/lessons")}
              className="px-3 py-2 bg-[var(--surface-card)] border border-[color:var(--border-strong)] rounded-lg hover:border-[color:var(--color-accent-blue)] transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-accent-blue)] focus-visible:ring-offset-[var(--surface-main)]"
              type="button"
              aria-label="Back to lessons"
            >
              <div className="flex items-center gap-2 text-[color:var(--text-secondary-strong)]">
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span className="font-inter text-sm">Exit</span>
              </div>
            </button>
            <button
              onClick={() => {
                setIsContentChanging(true);
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
                });
                // Reset content changing flag after a short delay
                setTimeout(() => setIsContentChanging(false), 150);
              }}
              className="px-3 py-2 bg-orange-500/20 border border-orange-500/40 rounded-lg hover:border-orange-500 text-orange-300 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-400 focus-visible:ring-offset-[var(--surface-main)]"
              type="button"
              aria-pressed={showPinyin}
              aria-label={showPinyin ? "Hide all pinyin" : "Show all pinyin"}
            >
              <div className="flex items-center gap-2 text-[color:var(--text-secondary-strong)]">
                {showPinyin ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
                <span className="font-inter text-sm whitespace-nowrap">
                  Pinyin (All)
                </span>
              </div>
            </button>
            <button
              onClick={() => {
                setIsContentChanging(true);
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
                });
                // Reset content changing flag after a short delay
                setTimeout(() => setIsContentChanging(false), 150);
              }}
              className="px-3 py-2 bg-purple-600/20 border border-purple-600/40 rounded-lg hover:border-purple-600 text-purple-300 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-400 focus-visible:ring-offset-[var(--surface-main)]"
              type="button"
              aria-pressed={showTranslation}
              aria-label={
                showTranslation
                  ? "Hide all translations"
                  : "Show all translations"
              }
            >
              <div className="flex items-center gap-2 text-[color:var(--text-secondary-strong)]">
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
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
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
              className="px-3 py-2 bg-[var(--surface-card)] border border-[color:var(--border-strong)] rounded-lg hover:border-[color:var(--color-accent-blue)] transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-accent-blue)] focus-visible:ring-offset-[var(--surface-main)] min-w-0"
              type="button"
              aria-pressed={multiSelect}
              aria-label={
                multiSelect
                  ? "Cancel word selection"
                  : "Select words to add to flashcards"
              }
            >
              <div className="flex items-center gap-2 text-[color:var(--text-secondary-strong)] min-w-0 shrink">
                {multiSelect ? (
                  <CheckSquare
                    className="w-4 h-4 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <Square className="w-4 h-4 shrink-0" aria-hidden="true" />
                )}
                <span className="font-inter text-sm whitespace-nowrap">
                  {multiSelect ? (
                    "Cancel Selection"
                  ) : (
                    <>
                      <span className="hidden sm:inline">
                        Select Words to Add to Flashcards
                      </span>
                      <span className="sm:hidden">Select Words</span>
                    </>
                  )}
                </span>
              </div>
            </button>
            {multiSelect && (
              <button
                onClick={() => void addSelectedToFlashcards()}
                disabled={Object.keys(selectedWords).length === 0}
                className="px-3 py-2 bg-[var(--color-accent-blue)] text-white text-sm rounded-lg hover:bg-[var(--accent-blue-strong)] transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-accent-blue)] focus-visible:ring-offset-[var(--surface-main)]"
                type="button"
                aria-label="Add selected words to flashcards"
              >
                Add Selected ({Object.keys(selectedWords).length})
              </button>
            )}
            <button
              onClick={() => void lessonQuery.refetch()}
              disabled={loading}
              className="p-2 hover:bg-[color:var(--border-strong)] rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-accent-blue)] focus-visible:ring-offset-[var(--surface-main)]"
              title="Refresh"
              type="button"
              aria-label="Refresh lesson"
            >
              <RefreshCw
                className={`w-4 h-4 text-[color:var(--text-secondary-strong)] ${loading ? "motion-safe:animate-spin" : ""}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </motion.div>

        {/* Tap area to show header when hidden */}
        {!isHeaderVisible && (
          <div
            className="fixed top-0 left-0 right-0 h-16 z-10 cursor-pointer"
            onClick={handleTapToShowHeader}
            aria-label="Tap to show controls"
            title="Tap to show controls"
          />
        )}

        {(story?.titlePinyin ||
          story?.titleTranslation ||
          dialogue?.titlePinyin ||
          dialogue?.titleTranslation ||
          data?.title) && (
          <div className="bg-[var(--surface-card)] rounded-lg p-4 border border-[color:var(--border-strong)]">
            {data?.title ? (
              <div className="sm:flex sm:justify-center sm:text-center text-white font-inter text-xl mb-1">
                {data.title}
              </div>
            ) : null}
            {story?.titlePinyin || dialogue?.titlePinyin ? (
              <div className="sm:flex sm:justify-center sm:text-center text-[color:var(--text-accent)] font-inter text-sm mb-1">
                {story?.titlePinyin || dialogue?.titlePinyin}
              </div>
            ) : null}
            {story?.titleTranslation || dialogue?.titleTranslation ? (
              <div className="sm:flex sm:justify-center sm:text-center text-[color:var(--text-secondary-strong)] font-inter text-sm">
                {story?.titleTranslation || dialogue?.titleTranslation}
              </div>
            ) : null}
          </div>
        )}

        {loading ? (
          <div className="space-y-6">
            {/* Title block skeleton */}
            <div className="bg-[var(--surface-card)] rounded-lg p-4 border border-[color:var(--border-strong)] sm:flex sm:flex-col sm:items-center">
              <div className="h-6 w-48 bg-[color:var(--border-overlay)]  rounded motion-safe:animate-pulse mb-2" />
              <div className="h-4 w-40 bg-[color:var(--border-overlay)] rounded motion-safe:animate-pulse mb-2" />
              <div className="h-4 w-64 bg-[color:var(--border-overlay)] rounded motion-safe:animate-pulse" />
            </div>

            {/* Content skeleton */}
            <div className="sm:bg-[var(--surface-card)] sm:rounded-xl sm:p-6 sm:border sm:border-[color:var(--border-strong)] relative">
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-5 w-full bg-[color:var(--border-overlay)] rounded motion-safe:animate-pulse" />
                    <div className="h-5 w-[92%] bg-[color:var(--border-overlay)] rounded motion-safe:animate-pulse" />
                    <div className="h-5 w-[88%] bg-[color:var(--border-overlay)] rounded motion-safe:animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : error ? (
          <p className="text-red-400 font-inter text-sm">{error}</p>
        ) : !data ? (
          <p className="text-[color:var(--text-secondary-strong)] font-inter text-sm">
            No content
          </p>
        ) : (
          <div
            ref={contentRef}
            className="sm:bg-[var(--surface-card)] sm:rounded-xl sm:p-6 sm:border sm:border-[color:var(--border-strong)] relative overflow-x-hidden"
          >
            {accessBanner}
            {isPreview && (
              <div className="text-center text-sm text-[color:var(--text-secondary-strong)] py-12">
                Upgrade to Basic or Premium to unlock the full lesson content.
              </div>
            )}
            {story && !isPreview && (
              <StorySection
                segmentedParagraphs={
                  segmentedParagraphs as unknown as LessonToken[][]
                }
                translationParagraphs={
                  translationParagraphs as Array<string | undefined>
                }
                isChunkPinyinOn={isChunkPinyinOn}
                isChunkTransOn={isChunkTransOn}
                setChunkPinyinOn={setChunkPinyinOn}
                setChunkTransOn={setChunkTransOn}
                hskUnderlineClass={hskUnderlineClass}
                multiSelect={multiSelect}
                selectedWords={selectedWords}
                toggleSelectWord={toggleSelectWord}
                contentRef={contentRef}
                setPopup={setPopup}
                openFromElement={
                  openMainPopupFromElement as unknown as TokenRendererProps["openFromElement"]
                }
              />
            )}

            {dialogue && !isPreview && Array.isArray(dialogue.turns) && (
              <DialogueSection
                turns={dialogue.turns}
                isTurnPinyinOn={isTurnPinyinOn}
                isTurnTransOn={isTurnTransOn}
                setTurnPinyinOn={setTurnPinyinOn}
                setTurnTransOn={setTurnTransOn}
                hskUnderlineClass={hskUnderlineClass}
                multiSelect={multiSelect}
                selectedWords={selectedWords}
                toggleSelectWord={toggleSelectWord}
                contentRef={contentRef}
                setPopup={setPopup}
                openFromElement={
                  openMainPopupFromElement as unknown as TokenRendererProps["openFromElement"]
                }
              />
            )}
            {dialogue && !isPreview && (
              <>
                {/* Quiz section (dialogue) */}
                {!isPreview &&
                  (() => {
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
                        <QuizSection
                          quiz={quiz}
                          disabled={Boolean(data?.finished)}
                          multiSelect={multiSelect}
                          selectedWords={selectedWords}
                          toggleSelectWord={toggleSelectWord}
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
                    <NotesSection
                      title="Notes"
                      notes={dialogue.grammarNotes}
                      notesPinyinOn={notesPinyinOn}
                      onTogglePinyin={() => setNotesPinyinOn((v) => !v)}
                      sectionKey="dialogue"
                      multiSelect={multiSelect}
                      selectedWords={selectedWords}
                      toggleSelectWord={toggleSelectWord}
                      contentRef={contentRef}
                      setPopup={setNotesPopup}
                      openFromElement={
                        openMainPopupFromElement as unknown as TokenRendererProps["openFromElement"]
                      }
                      hskUnderlineClass={hskUnderlineClass}
                    />
                  )}
              </>
            )}

            {/* Quiz section (story only; dialogue quiz is rendered above notes inside the dialogue block) */}
            {!isPreview &&
              (() => {
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
                    <QuizSection
                      quiz={quiz}
                      disabled={Boolean(data?.finished)}
                      multiSelect={multiSelect}
                      selectedWords={selectedWords}
                      toggleSelectWord={toggleSelectWord}
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
              !isPreview &&
              Array.isArray(story.grammarNotes) &&
              story.grammarNotes.length > 0 && (
                <div className="mt-6">
                  <NotesSection
                    title="Notes"
                    notes={story.grammarNotes}
                    notesPinyinOn={notesPinyinOn}
                    onTogglePinyin={() => setNotesPinyinOn((v) => !v)}
                    sectionKey="story"
                    multiSelect={multiSelect}
                    selectedWords={selectedWords}
                    toggleSelectWord={toggleSelectWord}
                    contentRef={contentRef}
                    setPopup={setNotesPopup}
                    openFromElement={
                      openMainPopupFromElement as unknown as TokenRendererProps["openFromElement"]
                    }
                    hskUnderlineClass={hskUnderlineClass}
                  />
                </div>
              )}

            {Array.isArray(story?.tipsRich) &&
              !isPreview &&
              story!.tipsRich!.length > 0 && (
                <div className="mt-4 border border-[color:var(--border-default)] rounded-lg p-3 bg-[var(--surface-note)]">
                  <div className="text-xs font-semibold text-white mb-2">
                    Tips
                  </div>
                  <ul className="space-y-2 list-disc list-outside pl-4 marker:text-[var(--text-marker)]">
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
                              {
                                section: "dialogue",
                                noteIndex: i,
                                field: "tip",
                              }
                            )}
                            {tip.en ? (
                              <div className="text-[color:var(--text-tertiary)] text-xs">
                                {tip.en}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <div className="text-[color:var(--text-subtle)]">
                              {tip.zh}
                            </div>
                            {notesPinyinOn ? null : null}
                            {tip.en ? (
                              <div className="text-[color:var(--text-tertiary)] text-xs">
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
              !isPreview &&
              dialogue!.tipsRich!.length > 0 && (
                <div className="mt-4 border border-[color:var(--border-default)] rounded-lg p-3 bg-[var(--surface-note)]">
                  <div className="text-xs font-semibold text-white mb-2">
                    Tips
                  </div>
                  <ul className="space-y-2 list-disc list-outside pl-4 marker:text-[var(--text-marker)]">
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
                              <div className="text-[color:var(--text-tertiary)] text-xs">
                                {tip.en}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <div className="text-[color:var(--text-subtle)]">
                              {tip.zh}
                            </div>
                            {notesPinyinOn ? null : null}
                            {tip.en ? (
                              <div className="text-[color:var(--text-tertiary)] text-xs">
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
                      `w-full sm:w-auto px-4 py-2 text-sm rounded-lg font-medium transition-all duration-200 active:scale-[0.98]  disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-accent-blue)] focus-visible:ring-offset-[var(--surface-main)] ` +
                      (data?.finished
                        ? `bg-green-600 text-white border border-green-500 hover:bg-green-500`
                        : `bg-[var(--surface-main)] text-white border border-[color:var(--border-contrast)] hover:border-[color:var(--color-accent-blue)] shadow-sm`)
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
                        className="mr-2 inline h-4 w-4 animate-spin text-[color:var(--text-spinner)]"
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
                className="hidden sm:block bg-[var(--surface-card)] border border-[color:var(--border-strong)] rounded-xl shadow-2xl p-4 w-64"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-white text-lg truncate">
                    {popup.data?.word}
                  </div>
                  {typeof popup.data?.hskLevel === "number" && (
                    <span
                      className={`text-[10px] leading-none px-2 py-[2px] rounded-full ${getHSKPillClasses(
                        popup.data?.hskLevel
                      )}`}
                      aria-label={`HSK level ${popup.data?.hskLevel}`}
                    >
                      HSK {popup.data?.hskLevel}
                    </span>
                  )}
                </div>
                {popup.data?.pinyin && (
                  <div className="text-[color:var(--text-highlight)] text-sm font-medium truncate">
                    {popup.data?.pinyin}
                  </div>
                )}
                {Array.isArray(popup.data?.definitions) &&
                (popup.data?.definitions?.length || 0) > 0 ? (
                  <div className="text-xs text-[color:var(--text-secondary-strong)] mt-2 space-y-1">
                    {(popup.data?.definitions as string[]).map(
                      (d: string, i: number) => (
                        <div key={i}>• {d}</div>
                      )
                    )}
                  </div>
                ) : popup.data?.definition ? (
                  <div className="text-xs text-[color:var(--text-secondary-strong)] mt-2">
                    {popup.data?.definition}
                  </div>
                ) : null}
                <div className="mt-3 pt-3 border-t border-[color:var(--border-strong)]">
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
                      const paraIndex = popup.data?.paraIndex ?? -1;
                      const tokenIndex = popup.data?.tokenIndex ?? -1;
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
                          t.hanzi?.includes(popup.data?.word || "")
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
                        Array.isArray(popup.data?.definitions) &&
                        (popup.data?.definitions?.length || 0) > 0
                      ) {
                        vocabDef = popup.data?.definitions?.[0];
                      } else if (popup.data?.definition) {
                        vocabDef = popup.data?.definition;
                      }
                      let vocabHskLevel: number | undefined = undefined;
                      if (
                        typeof popup.data?.paraIndex === "number" &&
                        typeof popup.data?.tokenIndex === "number"
                      ) {
                        const seg = (segmentedParagraphs[
                          popup.data?.paraIndex as number
                        ] || [])[popup.data?.tokenIndex as number] as
                          | LessonToken
                          | undefined;
                        if (seg && typeof seg.hskLevel === "number") {
                          vocabHskLevel = seg.hskLevel;
                        }
                      }
                      void addSingleToFlashcards(popup.data?.word || "", ctx, {
                        pinyin: popup.data?.pinyin,
                        definition: vocabDef,
                        hskLevel: vocabHskLevel,
                      });
                      setPopup((p) => ({ ...p, open: false }));
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[var(--color-accent-blue)] text-white rounded-lg hover:bg-[var(--accent-blue-strong)] transition-colors duration-200 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm font-inter">
                      Add to Flashcards
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Mobile top sheet popup */}
            <AnimatePresence>
              {popup.open && (
                <motion.div
                  initial={{ y: "-100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "-100%" }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                    duration: 0.3,
                  }}
                  className="sm:hidden fixed inset-x-0 top-0 z-40 bg-[color:var(--surface-body-95)] backdrop-blur border-b border-[color:var(--border-muted)] p-4"
                >
                  <div className="max-w-sm mx-auto">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="font-bold text-white text-lg truncate">
                        {popup.data?.word}
                      </div>
                      {typeof popup.data?.hskLevel === "number" && (
                        <span
                          className={`text-[10px] leading-none px-2 py-[2px] rounded-full ${getHSKPillClasses(
                            popup.data?.hskLevel
                          )}`}
                        >
                          HSK {popup.data?.hskLevel}
                        </span>
                      )}
                    </div>
                    {popup.data?.pinyin && (
                      <div className="text-[color:var(--text-highlight)] text-sm font-medium truncate mb-2">
                        {popup.data?.pinyin}
                      </div>
                    )}
                    {Array.isArray(popup.data?.definitions) &&
                    (popup.data?.definitions?.length || 0) > 0 ? (
                      <div className="text-xs text-[color:var(--text-secondary-strong)] mb-3 space-y-1">
                        {(popup.data?.definitions as string[]).map(
                          (d: string, i: number) => (
                            <div key={i}>• {d}</div>
                          )
                        )}
                      </div>
                    ) : popup.data?.definition ? (
                      <div className="text-xs text-[color:var(--text-secondary-strong)] mb-3">
                        {popup.data?.definition}
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setPopup((p) => ({ ...p, open: false }));
                        }}
                        className="px-3 py-2 bg-[var(--surface-card)] border border-[color:var(--border-strong)] rounded-lg hover:border-[color:var(--color-accent-blue)] text-[color:var(--text-secondary-strong)] cursor-pointer text-sm"
                      >
                        Close
                      </button>
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
                          const paraIndex = popup.data?.paraIndex ?? -1;
                          const tokenIndex = popup.data?.tokenIndex ?? -1;
                          if (paraIndex >= 0 && tokenIndex >= 0) {
                            const paraHanzi = storyParagraphs[paraIndex] || "";
                            const hanziSentences = paraHanzi
                              .split(/(?<=[。！？!?])/)
                              .map((s) => s.trim())
                              .filter(Boolean);
                            const tokens = segmentedParagraphs[paraIndex] || [];
                            const tokenStart = tokens
                              .slice(0, tokenIndex)
                              .reduce(
                                (acc, s) => acc + (s.text?.length || 0),
                                0
                              );
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
                              const sentGlobalStart =
                                paraStart + sentStartInPara;
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
                              t.hanzi?.includes(popup.data?.word || "")
                            );
                            if (found) {
                              let perCharPinyin: string | undefined =
                                found.pinyin;
                              if (
                                !perCharPinyin &&
                                Array.isArray(found.segments)
                              ) {
                                const chars = Array.from(found.hanzi || "");
                                const per: string[] = new Array(
                                  chars.length
                                ).fill("");
                                let ci = 0;
                                for (const s of found.segments) {
                                  const chineseLen = Array.from(
                                    s.text || ""
                                  ).filter((c) =>
                                    /[\u3400-\u9FFF]/.test(c)
                                  ).length;
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
                            Array.isArray(popup.data?.definitions) &&
                            (popup.data?.definitions?.length || 0) > 0
                          ) {
                            vocabDef = popup.data?.definitions?.[0];
                          } else if (popup.data?.definition) {
                            vocabDef = popup.data?.definition;
                          }
                          let vocabHskLevel: number | undefined = undefined;
                          if (
                            typeof popup.data?.paraIndex === "number" &&
                            typeof popup.data?.tokenIndex === "number"
                          ) {
                            const seg = (segmentedParagraphs[
                              popup.data?.paraIndex as number
                            ] || [])[popup.data?.tokenIndex as number] as
                              | LessonToken
                              | undefined;
                            if (seg && typeof seg.hskLevel === "number") {
                              vocabHskLevel = seg.hskLevel;
                            }
                          }
                          void addSingleToFlashcards(
                            popup.data?.word || "",
                            ctx,
                            {
                              pinyin: popup.data?.pinyin,
                              definition: vocabDef,
                              hskLevel: vocabHskLevel,
                            }
                          );
                          setPopup((p) => ({ ...p, open: false }));
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[var(--color-accent-blue)] text-white rounded-lg hover:bg-[var(--accent-blue-strong)] transition-colors duration-200 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="text-sm font-inter">
                          Add to Flashcards
                        </span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                className="hidden sm:block bg-[var(--surface-card)] border border-[color:var(--border-strong)] rounded-xl shadow-2xl p-4 w-64"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-white text-lg truncate">
                    {notesPopup.data?.word}
                  </div>
                  {typeof notesPopup.data?.hskLevel === "number" && (
                    <span
                      className={`text-[10px] leading-none px-2 py-[2px] rounded-full ${getHSKPillClasses(
                        notesPopup.data?.hskLevel
                      )}`}
                      aria-label={`HSK level ${notesPopup.data?.hskLevel}`}
                    >
                      HSK {notesPopup.data?.hskLevel}
                    </span>
                  )}
                </div>
                {notesPopup.data?.pinyin && (
                  <div className="text-[color:var(--text-highlight)] text-sm font-medium truncate">
                    {notesPopup.data?.pinyin}
                  </div>
                )}
                {Array.isArray(notesPopup.data?.definitions) &&
                (notesPopup.data?.definitions?.length || 0) > 0 ? (
                  <div className="text-xs text-[color:var(--text-secondary-strong)] mt-2 space-y-1">
                    {(notesPopup.data?.definitions as string[]).map(
                      (d: string, i: number) => (
                        <div key={i}>• {d}</div>
                      )
                    )}
                  </div>
                ) : notesPopup.data?.definition ? (
                  <div className="text-xs text-[color:var(--text-secondary-strong)] mt-2">
                    {notesPopup.data?.definition}
                  </div>
                ) : null}
                <div className="mt-3 pt-3 border-t border-[color:var(--border-strong)]">
                  <button
                    onClick={async () => {
                      // Create context from the notes popup data
                      const ctx = {
                        hanzi:
                          notesPopup.data?.contextZh || notesPopup.data?.word,
                        pinyin: undefined,
                        translation: notesPopup.data?.contextEn,
                      };

                      // Derive vocab metadata from popup
                      let vocabDef: string | undefined = undefined;
                      if (
                        Array.isArray(notesPopup.data?.definitions) &&
                        (notesPopup.data?.definitions?.length || 0) > 0
                      ) {
                        vocabDef = notesPopup.data?.definitions?.[0];
                      } else if (notesPopup.data?.definition) {
                        vocabDef = notesPopup.data?.definition;
                      }

                      await addSingleToFlashcards(
                        notesPopup.data?.word || "",
                        ctx,
                        {
                          pinyin: notesPopup.data?.pinyin,
                          definition: vocabDef,
                          hskLevel: undefined, // Notes don't have HSK level info
                        }
                      );
                      setNotesPopup((p) => ({ ...p, open: false }));
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[var(--color-accent-blue)] text-white rounded-lg hover:bg-[var(--accent-blue-strong)] transition-colors duration-200 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm font-inter">
                      Add to Flashcards
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Mobile top sheet popup for notes */}
            <AnimatePresence>
              {notesPopup.open && (
                <motion.div
                  initial={{ y: "-100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "-100%" }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                    duration: 0.3,
                  }}
                  className="sm:hidden fixed inset-x-0 top-0 z-40 bg-[color:var(--surface-body-95)] backdrop-blur border-b border-[color:var(--border-muted)] p-4"
                >
                  <div className="max-w-sm mx-auto">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="font-bold text-white text-lg truncate">
                        {notesPopup.data?.word}
                      </div>
                      {typeof notesPopup.data?.hskLevel === "number" && (
                        <span
                          className={`text-[10px] leading-none px-2 py-[2px] rounded-full ${getHSKPillClasses(
                            notesPopup.data?.hskLevel
                          )}`}
                        >
                          HSK {notesPopup.data?.hskLevel}
                        </span>
                      )}
                    </div>
                    {notesPopup.data?.pinyin && (
                      <div className="text-[color:var(--text-highlight)] text-sm font-medium truncate mb-2">
                        {notesPopup.data?.pinyin}
                      </div>
                    )}
                    {Array.isArray(notesPopup.data?.definitions) &&
                    (notesPopup.data?.definitions?.length || 0) > 0 ? (
                      <div className="text-xs text-[color:var(--text-secondary-strong)] mb-3 space-y-1">
                        {(notesPopup.data?.definitions as string[]).map(
                          (d: string, i: number) => (
                            <div key={i}>• {d}</div>
                          )
                        )}
                      </div>
                    ) : notesPopup.data?.definition ? (
                      <div className="text-xs text-[color:var(--text-secondary-strong)] mb-3">
                        {notesPopup.data?.definition}
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setNotesPopup((p) => ({ ...p, open: false }));
                        }}
                        className="px-3 py-2 bg-[var(--surface-card)] border border-[color:var(--border-strong)] rounded-lg hover:border-[color:var(--color-accent-blue)] text-[color:var(--text-secondary-strong)] cursor-pointer text-sm"
                      >
                        Close
                      </button>
                      <button
                        onClick={async () => {
                          // Create context from the notes popup data
                          const ctx = {
                            hanzi:
                              notesPopup.data?.contextZh ||
                              notesPopup.data?.word,
                            pinyin: undefined,
                            translation: notesPopup.data?.contextEn,
                          };

                          // Derive vocab metadata from popup
                          let vocabDef: string | undefined = undefined;
                          if (
                            Array.isArray(notesPopup.data?.definitions) &&
                            (notesPopup.data?.definitions?.length || 0) > 0
                          ) {
                            vocabDef = notesPopup.data?.definitions?.[0];
                          } else if (notesPopup.data?.definition) {
                            vocabDef = notesPopup.data?.definition;
                          }

                          await addSingleToFlashcards(
                            notesPopup.data?.word || "",
                            ctx,
                            {
                              pinyin: notesPopup.data?.pinyin,
                              definition: vocabDef,
                              hskLevel: undefined, // Notes don't have HSK level info
                            }
                          );
                          setNotesPopup((p) => ({ ...p, open: false }));
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[var(--color-accent-blue)] text-white rounded-lg hover:bg-[var(--accent-blue-strong)] transition-colors duration-200 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="text-sm font-inter">
                          Add to Flashcards
                        </span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
