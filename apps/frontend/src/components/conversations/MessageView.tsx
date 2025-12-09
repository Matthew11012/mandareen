"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, Loader2, Sparkles, Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { AiMessage } from "./AiMessage";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { usePopup } from "@/hooks/usePopup";
import { TokenRenderer } from "@/components/lessons/TokenRenderer";
import type { TokenRendererProps } from "@/components/lessons/TokenRenderer";
import type {
  Message,
  MessageNotes,
  ReplySuggestion,
} from "@/lib/api/conversations";
import { addSingleToFlashcards } from "@/lib/utils/flashcards";
import { getHSKPillClasses } from "@/lib/constants/hsk";
import { buildFallbackSegments } from "@/lib/utils/segments";

const INT32_MAX = 2147483647;
const isPersistedMessageId = (id: number) =>
  Number.isFinite(id) && Math.abs(id) <= INT32_MAX;

type MessageWithPersistFlag = Message & { _persisted?: boolean };
type TokenData = {
  word?: string;
  pinyin?: string;
  definition?: string;
  definitions?: string[];
  hskLevel?: number;
};

interface MessageViewProps {
  messages: MessageWithPersistFlag[];
  aiShowPinyin: Record<number, boolean>;
  aiShowTrans: Record<number, boolean>;
  aiShowNotes: Record<number, boolean>;
  playing: Record<number, boolean>;
  onTogglePinyin: (messageId: number) => void;
  onToggleTranslation: (messageId: number) => void;
  onToggleNotes: (messageId: number) => void;
  onToggleAudio: (
    messageId: number,
    audioElement: HTMLAudioElement | null,
    source?: "manual" | "auto"
  ) => void | Promise<boolean>;
  onOpenNotesModal: (message: Message) => void;
  onGenerateNotes?: (messageId: number) => Promise<void>;
  conversationId: number | null;
  resolveMediaUrl: (url?: string) => string | undefined;
  footer?: ReactNode;
  suggestionsForMessage?: {
    messageId: number;
    suggestions: ReplySuggestion[];
    showPinyin?: boolean;
  } | null;
}

export function MessageView({
  messages,
  aiShowPinyin,
  aiShowTrans,
  aiShowNotes,
  playing,
  onTogglePinyin,
  onToggleTranslation,
  onToggleNotes,
  onToggleAudio,
  onOpenNotesModal,
  onGenerateNotes,
  conversationId,
  resolveMediaUrl,
  footer,
  suggestionsForMessage,
}: MessageViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [generatingNotes, setGeneratingNotes] = useState<
    Record<number, boolean>
  >({});
  const prevScrollState = useRef<{
    conversationId: number | null;
    lastMessageKey: string | null;
    length: number;
  }>({
    conversationId: null,
    lastMessageKey: null,
    length: 0,
  });
  const prevSuggestionsState = useRef<{
    messageId: number | null;
    count: number;
  }>({ messageId: null, count: 0 });

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const lastMessage = messages[messages.length - 1];
    const lastMessageKey =
      lastMessage && typeof lastMessage.id !== "undefined"
        ? String(lastMessage.id)
        : `len-${messages.length}`;

    const conversationChanged =
      prevScrollState.current.conversationId !== conversationId;
    const lengthChanged = messages.length !== prevScrollState.current.length;
    const lastKeyChanged =
      lastMessageKey !== prevScrollState.current.lastMessageKey;

    const shouldScroll = conversationChanged || lengthChanged || lastKeyChanged;

    prevScrollState.current = {
      conversationId,
      lastMessageKey,
      length: messages.length,
    };

    if (!shouldScroll) return;

    try {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } catch {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, conversationId]);

  // Auto-scroll when suggestions footer appears/updates
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !suggestionsForMessage) return;

    const count = Array.isArray(suggestionsForMessage.suggestions)
      ? suggestionsForMessage.suggestions.length
      : 0;
    const messageId = suggestionsForMessage.messageId ?? null;

    const shouldScroll =
      messageId !== prevSuggestionsState.current.messageId ||
      count !== prevSuggestionsState.current.count;

    prevSuggestionsState.current = { messageId, count };
    if (!shouldScroll) return;

    try {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } catch {
      el.scrollTop = el.scrollHeight;
    }
  }, [suggestionsForMessage]);

  type PopupData = {
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    hskLevel?: number;
  };

  const {
    popupRef,
    state: popup,
    position: popupPos,
    openAtPoint: openPopupAtPoint,
    close: closePopup,
  } = usePopup<PopupData>({
    containerRef: scrollRef,
    toolbarSelector: undefined,
    margin: 8,
  });

  const suggestionsFooter = useMemo(() => {
    if (
      !suggestionsForMessage ||
      !Array.isArray(suggestionsForMessage.suggestions) ||
      suggestionsForMessage.suggestions.length === 0
    ) {
      return null;
    }
    const showPinyin = suggestionsForMessage.showPinyin ?? true;
    const handleToken = (
      el: HTMLElement,
      token?: {
        word?: string;
        pinyin?: string;
        definition?: string;
        definitions?: string[];
        hskLevel?: number;
      }
    ) => {
      const rect = el.getBoundingClientRect();
      const anchorHeight = rect.height;
      openPopupAtPoint({
        clientX: rect.left + rect.width / 2,
        clientY: rect.top,
        anchorHeight,
        data: {
          word: token?.word || "",
          pinyin: token?.pinyin,
          definition: token?.definition,
          definitions: token?.definitions,
          hskLevel: token?.hskLevel,
        },
      });
    };
    return (
      <div className="mt-6 mb-2">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-[#9aa6ff]" />
          <div className="text-xs font-semibold text-[#9aa6ff] uppercase tracking-wide">
            Suggestions
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {suggestionsForMessage.suggestions.map((s, idx) => (
            <div
              key={`${s.zh}-${idx}`}
              className="group rounded-xl border border-[#2e2f36] bg-[#252830] p-4 shadow-sm hover:border-[#4040f2]/50 hover:bg-[#2a2e36] transition-all duration-200 cursor-default"
            >
              <TokenRenderer
                segments={
                  Array.isArray(s.segments) && s.segments.length > 0
                    ? s.segments.map((seg) => ({
                        text: seg.text,
                        isWord: seg.isWord ?? true, // force clickable
                        pinyin: seg.pinyin,
                        definition: seg.definition,
                        definitions: seg.definitions,
                        hskLevel: seg.hskLevel,
                      }))
                    : [
                        {
                          text: s.zh,
                          isWord: true,
                          pinyin: s.pinyin,
                          definition: s.translation,
                        },
                      ]
                }
                fallbackZh={undefined}
                showPinyin={showPinyin}
                hoverClass="hover:bg-[#404040] rounded"
                textSizeClass="text-[16px] sm:text-[18px]"
                keyPrefix={`suggestion-${suggestionsForMessage.messageId}-${idx}`}
                openFromElement={(el, data) =>
                  handleToken(
                    el,
                    data as {
                      word?: string;
                      pinyin?: string;
                      definition?: string;
                      definitions?: string[];
                      hskLevel?: number;
                    }
                  )
                }
                contentRef={scrollRef}
              />
              {s.translation ? (
                <div className="text-xs text-[#a6a6a6] leading-relaxed mt-2 pt-2 border-t border-white/5 group-hover:border-white/10 transition-colors">
                  {s.translation}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }, [suggestionsForMessage, openPopupAtPoint]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto space-y-6 relative pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent py-4"
      aria-live="polite"
      aria-relevant="additions text"
      role="log"
    >
      {messages.map((m) => {
        const showPinyin = !!aiShowPinyin[m.id];
        const showTranslation = !!aiShowTrans[m.id];
        const messageIsPersisted =
          m._persisted ||
          (typeof m.id === "number" && isPersistedMessageId(m.id));
        return (
          <div
            key={`${m.id}-${m.role}`}
            className={`group flex flex-col ${m.role === "user" ? "items-end" : "items-start"} gap-2.5 max-w-[90%] sm:max-w-[85%] ${m.role === "user" ? "ml-auto" : "mr-auto"}`}
          >
            <div
              className={`text-xs  font-semibold uppercase tracking-wide ${
                m.role === "user" ? "text-white" : "text-white"
              }`}
            >
              {m.role === "user" ? "You" : "Mandareen"}
            </div>
            {/* Toggles Row (desktop above bubble) */}
            <div className="hidden sm:flex sm:flex-shrink-0 w-full sm:w-auto items-center gap-3 px-1 h-7 justify-start">
              {m.role === "ai" ? (
                <div className="flex items-center gap-2 opacity-100 transition-opacity duration-200">
                  {/* Notes Toggle */}
                  {m.notes?.grammarNotes?.length ||
                  (m.notes as MessageNotes)?.tipsRich?.length ? (
                    <button
                      type="button"
                      onClick={() => onToggleNotes(m.id)}
                      className={`px-3 py-2 flex items-center gap-1 rounded-full border transition-colors cursor-pointer ${
                        aiShowNotes[m.id]
                          ? "border-amber-400/50 bg-amber-500/10 text-amber-300"
                          : "border-zinc-700 bg-[#1f2229] text-zinc-300 hover:border-zinc-500 hover:text-white"
                      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10]`}
                      title="Toggle notes"
                      aria-label={
                        aiShowNotes[m.id] ? "Hide notes" : "Show notes"
                      }
                    >
                      <Sparkles className="w-4 h-4" />
                      <span className="text-[11px] font-semibold">Notes</span>
                    </button>
                  ) : (
                    onGenerateNotes &&
                    conversationId && (
                      <button
                        type="button"
                        disabled={generatingNotes[m.id] || !messageIsPersisted}
                        onClick={async () => {
                          if (
                            generatingNotes[m.id] ||
                            !onGenerateNotes ||
                            !messageIsPersisted
                          )
                            return;
                          setGeneratingNotes((prev) => ({
                            ...prev,
                            [m.id]: true,
                          }));
                          try {
                            await onGenerateNotes(m.id);
                          } catch (err) {
                            console.error("Failed to generate notes:", err);
                          } finally {
                            setGeneratingNotes((prev) => {
                              const next = { ...prev };
                              delete next[m.id];
                              return next;
                            });
                          }
                        }}
                        className={`px-3 py-2 flex items-center gap-1 rounded-full border transition-colors cursor-pointer ${
                          generatingNotes[m.id]
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-blue-500 bg-blue-600 text-white hover:bg-blue-500"
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10]`}
                        title="Generate notes"
                        aria-label={
                          generatingNotes[m.id]
                            ? "Generating notes…"
                            : "Generate notes"
                        }
                      >
                        {generatingNotes[m.id] ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        <span className="text-[11px] font-semibold">
                          Generate notes
                        </span>
                      </button>
                    )
                  )}

                  {/* Pinyin Toggle */}
                  <button
                    type="button"
                    disabled={m._loadingPinyin}
                    onClick={() => !m._loadingPinyin && onTogglePinyin(m.id)}
                    className={`px-2.5 py-1 h-9 w-9 text-[11px] font-semibold rounded-full border transition-all cursor-pointer ${
                      aiShowPinyin[m.id]
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-300"
                        : "bg-[#1f2229] border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10]`}
                    aria-label={
                      aiShowPinyin[m.id] ? "Hide pinyin" : "Show pinyin"
                    }
                  >
                    PY
                  </button>

                  {/* Translation Toggle */}
                  <button
                    type="button"
                    disabled={m._loadingTranslation}
                    onClick={() =>
                      !m._loadingTranslation && onToggleTranslation(m.id)
                    }
                    className={`px-2.5 py-1 h-9 w-9 text-[11px] font-semibold rounded-full border transition-all cursor-pointer ${
                      aiShowTrans[m.id]
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-300"
                        : "bg-[#1f2229] border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10]`}
                    aria-label={
                      aiShowTrans[m.id]
                        ? "Hide translation"
                        : "Show translation"
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

                  {/* Audio Player Hidden Element */}
                  {m.audioUrl && (
                    <audio
                      id={`audio-${m.id}`}
                      src={resolveMediaUrl(m.audioUrl) || ""}
                      preload="metadata"
                    />
                  )}

                  {/* Audio Toggle */}
                  <button
                    type="button"
                    disabled={m._loadingAudio}
                    onClick={() => {
                      if (!m._loadingAudio) {
                        const el = document.getElementById(
                          `audio-${m.id}`
                        ) as HTMLAudioElement | null;
                        void onToggleAudio(m.id, el, "manual");
                      }
                    }}
                    className={`p-2 h-9 w-9 flex justify-center items-center rounded-full border transition-colors cursor-pointer ${
                      playing[m.id]
                        ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                        : "border-zinc-700 bg-[#1f2229] text-zinc-300 hover:border-zinc-500 hover:text-white"
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10]`}
                    title={playing[m.id] ? "Pause audio" : "Play audio"}
                    aria-label={playing[m.id] ? "Pause audio" : "Play audio"}
                  >
                    {m._loadingAudio ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 opacity-100 transition-opacity duration-200">
                  {/* Pinyin Toggle for user */}
                  <button
                    type="button"
                    disabled={m._loadingPinyin}
                    onClick={() => !m._loadingPinyin && onTogglePinyin(m.id)}
                    className={`px-2.5 py-1 h-9 w-9 text-[11px] font-semibold rounded-full border transition-all cursor-pointer ${
                      showPinyin
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-300"
                        : "bg-[#1f2229] border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10]`}
                    aria-label={showPinyin ? "Hide pinyin" : "Show pinyin"}
                  >
                    PY
                  </button>

                  {/* Translation Toggle for user */}
                  <button
                    type="button"
                    disabled={m._loadingTranslation}
                    onClick={() =>
                      !m._loadingTranslation && onToggleTranslation(m.id)
                    }
                    className={`px-2.5 py-1 h-9 w-9 text-[11px] font-semibold rounded-full border transition-all cursor-pointer ${
                      showTranslation
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-300"
                        : "bg-[#1f2229] border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10]`}
                    aria-label={
                      showTranslation ? "Hide translation" : "Show translation"
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
              )}
            </div>

            {/* Message Bubble */}
            <div
              className={`relative px-5 py-3.5 shadow-sm text-base leading-relaxed ${
                m.role === "user"
                  ? "bg-[#4040f2] text-white rounded-3xl"
                  : "bg-[#22252a] text-zinc-100 border border-white/5 rounded-3xl"
              }`}
            >
              {m.role === "user" ? (
                (() => {
                  const segmentsForUser: TokenRendererProps["segments"] =
                    Array.isArray(m.segments) && m.segments.length > 0
                      ? (m.segments as TokenRendererProps["segments"])
                      : (buildFallbackSegments(
                          m.hanzi || "",
                          m.pinyin || ""
                        ) as TokenRendererProps["segments"]);

                  return (
                    <>
                      <TokenRenderer
                        segments={segmentsForUser}
                        fallbackZh={m.hanzi}
                        showPinyin={showPinyin}
                        textSizeClass="text-base"
                        hoverClass="hover:bg-[#404040] rounded"
                        openFromElement={(el, data) => {
                          const rect = el.getBoundingClientRect();
                          const token = data as TokenData | undefined;
                          openPopupAtPoint({
                            clientX: rect.left + rect.width / 2,
                            clientY: rect.top,
                            anchorHeight: rect.height,
                            data: {
                              word: token?.word || "",
                              pinyin: token?.pinyin,
                              definition: token?.definition,
                              definitions: token?.definitions,
                              hskLevel: token?.hskLevel,
                            },
                          });
                        }}
                        contentRef={scrollRef}
                        keyPrefix={`user-msg-${m.id}`}
                      />
                      {showTranslation && m.translation ? (
                        <div className="text-sm text-zinc-200 mt-2 leading-relaxed">
                          {m.translation}
                        </div>
                      ) : null}
                    </>
                  );
                })()
              ) : (
                <AiMessage
                  message={m}
                  showPinyin={showPinyin}
                  showTranslation={showTranslation}
                  showNotes={!!aiShowNotes[m.id]}
                  onOpenNotesModal={onOpenNotesModal}
                  containerRef={scrollRef}
                />
              )}
            </div>

            {/* Toggles Row (mobile below bubble) */}
            <div className="flex sm:hidden w-full items-center gap-3 px-1 h-7 justify-end">
              {m.role === "ai" ? (
                <div className="flex items-center gap-2 opacity-100 transition-opacity duration-200">
                  {/* Notes Toggle */}
                  {m.notes?.grammarNotes?.length ||
                  (m.notes as MessageNotes)?.tipsRich?.length ? (
                    <button
                      type="button"
                      onClick={() => onToggleNotes(m.id)}
                      className={`px-3 py-2 flex items-center gap-1 rounded-full border transition-colors cursor-pointer ${
                        aiShowNotes[m.id]
                          ? "border-amber-400/50 bg-amber-500/10 text-amber-300"
                          : "border-zinc-700 bg-[#1f2229] text-zinc-300 hover:border-zinc-500 hover:text-white"
                      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10]`}
                      title="Toggle notes"
                      aria-label={
                        aiShowNotes[m.id] ? "Hide notes" : "Show notes"
                      }
                    >
                      <Sparkles className="w-4 h-4" />
                      <span className="text-[11px] font-semibold">Notes</span>
                    </button>
                  ) : (
                    onGenerateNotes &&
                    conversationId && (
                      <button
                        type="button"
                        disabled={generatingNotes[m.id] || !messageIsPersisted}
                        onClick={async () => {
                          if (
                            generatingNotes[m.id] ||
                            !onGenerateNotes ||
                            !messageIsPersisted
                          )
                            return;
                          setGeneratingNotes((prev) => ({
                            ...prev,
                            [m.id]: true,
                          }));
                          try {
                            await onGenerateNotes(m.id);
                          } catch (err) {
                            console.error("Failed to generate notes:", err);
                          } finally {
                            setGeneratingNotes((prev) => {
                              const next = { ...prev };
                              delete next[m.id];
                              return next;
                            });
                          }
                        }}
                        className={`px-3 py-2 flex items-center gap-1 rounded-full border transition-colors cursor-pointer ${
                          generatingNotes[m.id]
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-blue-500 bg-blue-600 text-white hover:bg-blue-500"
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10]`}
                        title="Generate notes"
                        aria-label={
                          generatingNotes[m.id]
                            ? "Generating notes…"
                            : "Generate notes"
                        }
                      >
                        {generatingNotes[m.id] ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        <span className="text-[11px] font-semibold">
                          Generate notes
                        </span>
                      </button>
                    )
                  )}

                  {/* Pinyin Toggle */}
                  <button
                    type="button"
                    disabled={m._loadingPinyin}
                    onClick={() => !m._loadingPinyin && onTogglePinyin(m.id)}
                    className={`px-2.5 py-1 h-9 w-9 text-[11px] font-semibold rounded-full border transition-all cursor-pointer ${
                      aiShowPinyin[m.id]
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-300"
                        : "bg-[#1f2229] border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10]`}
                    aria-label={
                      aiShowPinyin[m.id] ? "Hide pinyin" : "Show pinyin"
                    }
                  >
                    PY
                  </button>

                  {/* Translation Toggle */}
                  <button
                    type="button"
                    disabled={m._loadingTranslation}
                    onClick={() =>
                      !m._loadingTranslation && onToggleTranslation(m.id)
                    }
                    className={`px-2.5 py-1 h-9 w-9 text-[11px] font-semibold rounded-full border transition-all cursor-pointer ${
                      aiShowTrans[m.id]
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-300"
                        : "bg-[#1f2229] border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10]`}
                    aria-label={
                      aiShowTrans[m.id]
                        ? "Hide translation"
                        : "Show translation"
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

                  {/* Audio Player Hidden Element */}
                  {m.audioUrl && (
                    <audio
                      id={`audio-${m.id}`}
                      src={resolveMediaUrl(m.audioUrl) || ""}
                      preload="metadata"
                    />
                  )}

                  {/* Audio Toggle */}
                  <button
                    type="button"
                    disabled={m._loadingAudio}
                    onClick={() => {
                      if (!m._loadingAudio) {
                        const el = document.getElementById(
                          `audio-${m.id}`
                        ) as HTMLAudioElement | null;
                        void onToggleAudio(m.id, el, "manual");
                      }
                    }}
                    className={`p-2 h-9 w-9 flex justify-center items-center rounded-full border transition-colors cursor-pointer ${
                      playing[m.id]
                        ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                        : "border-zinc-700 bg-[#1f2229] text-zinc-300 hover:border-zinc-500 hover:text-white"
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10]`}
                    title={playing[m.id] ? "Pause audio" : "Play audio"}
                    aria-label={playing[m.id] ? "Pause audio" : "Play audio"}
                  >
                    {m._loadingAudio ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 opacity-100 transition-opacity duration-200">
                  {/* Pinyin Toggle for user */}
                  <button
                    type="button"
                    disabled={m._loadingPinyin}
                    onClick={() => !m._loadingPinyin && onTogglePinyin(m.id)}
                    className={`px-2.5 py-1 h-9 w-9 text-[11px] font-semibold rounded-full border transition-all cursor-pointer ${
                      showPinyin
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-300"
                        : "bg-[#1f2229] border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10]`}
                    aria-label={showPinyin ? "Hide pinyin" : "Show pinyin"}
                  >
                    PY
                  </button>

                  {/* Translation Toggle for user */}
                  <button
                    type="button"
                    disabled={m._loadingTranslation}
                    onClick={() =>
                      !m._loadingTranslation && onToggleTranslation(m.id)
                    }
                    className={`px-2.5 py-1 h-9 w-9 text-[11px] font-semibold rounded-full border transition-all cursor-pointer ${
                      showTranslation
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-300"
                        : "bg-[#1f2229] border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10]`}
                    aria-label={
                      showTranslation ? "Hide translation" : "Show translation"
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
              )}
            </div>
          </div>
        );
      })}
      {suggestionsFooter}
      {footer ? <div className="mt-3">{footer}</div> : null}
      {popup.open ? (
        <div
          ref={popupRef}
          style={{
            position: "absolute",
            left: popupPos?.left ?? popup.x,
            top: popupPos?.top ?? popup.y,
            zIndex: 10,
            visibility: popupPos ? "visible" : "hidden",
            transform: popupPos ? "none" : "translate(-50%, calc(-100% - 8px))",
          }}
          className="hidden sm:block bg-[var(--surface-card)] border border-[color:var(--border-strong)] rounded-xl shadow-2xl p-4 w-64"
          role="dialog"
          aria-label={popup.data?.word || "Word details"}
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
          {popup.data?.pinyin ? (
            <div className="text-[color:var(--text-highlight)] text-sm font-medium truncate mt-1">
              {popup.data.pinyin}
            </div>
          ) : null}
          {popup.data?.definition ? (
            <div className="text-xs text-[color:var(--text-secondary-strong)] mt-2">
              {popup.data.definition}
            </div>
          ) : null}
          {/* Omit bullet list definitions to avoid duplicate rendering */}
          <div className="mt-3 pt-3 border-t border-[color:var(--border-strong)]">
            <button
              onClick={() => {
                void addSingleToFlashcards(popup.data?.word || "");
                closePopup();
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[var(--color-accent-blue)] text-white rounded-lg hover:bg-[var(--accent-blue-strong)] transition-colors duration-200 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-inter">Add to Flashcards</span>
            </button>
          </div>
        </div>
      ) : null}
      {/* Mobile top sheet popup for suggestions */}
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
            className="sm:hidden fixed inset-x-0 top-0 z-40 bg-[#1a1d23]/95 backdrop-blur border-b border-[color:var(--border-muted)] p-4"
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
                  {popup.data.pinyin}
                </div>
              )}
              {popup.data?.definition ? (
                <div className="text-xs text-[color:var(--text-secondary-strong)] mb-3">
                  {popup.data.definition}
                </div>
              ) : null}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    closePopup();
                  }}
                  className="px-3 py-2 bg-[var(--surface-card)] border border-[color:var(--border-strong)] rounded-lg hover:border-[color:var(--color-accent-blue)] text-[color:var(--text-secondary-strong)] cursor-pointer text-sm"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    await addSingleToFlashcards(popup.data?.word || "");
                    closePopup();
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[var(--color-accent-blue)] text-white rounded-lg hover:bg-[var(--accent-blue-strong)] transition-colors duration-200 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm font-inter">Add to Flashcards</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
