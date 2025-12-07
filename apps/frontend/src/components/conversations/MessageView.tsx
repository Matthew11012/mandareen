"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, Loader2, Sparkles, Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { AiMessage } from "./AiMessage";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { usePopup } from "@/hooks/usePopup";
import { TokenRenderer } from "@/components/lessons/TokenRenderer";
import type {
  Message,
  MessageNotes,
  ReplySuggestion,
} from "@/lib/api/conversations";
import { addSingleToFlashcards } from "@/lib/utils/flashcards";
import { getHSKPillClasses } from "@/lib/constants/hsk";

const INT32_MAX = 2147483647;
const isPersistedMessageId = (id: number) =>
  Number.isFinite(id) && Math.abs(id) <= INT32_MAX;

type MessageWithPersistFlag = Message & { _persisted?: boolean };

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

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    try {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } catch {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Auto-scroll when suggestions footer appears/updates
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !suggestionsForMessage) return;
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
      <div className="mt-3">
        <div className="text-xs font-semibold text-[#9aa6ff] mb-2 uppercase tracking-wide">
          Suggestions
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {suggestionsForMessage.suggestions.map((s, idx) => (
            <div
              key={`${s.zh}-${idx}`}
              className="rounded-lg border border-[#404040] bg-[#1f2430] px-3 py-2 shadow-sm"
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
                hoverClass="hover:bg-[#404040]"
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
                <div className="text-xs text-[#a6a6a6] leading-tight mt-1">
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
      className="flex-1 overflow-y-auto space-y-3 sm:bg-[#20242b] sm:border sm:border-[#2e2f36] sm:rounded-xl sm:p-4 relative pr-2"
      aria-live="polite"
      aria-relevant="additions text"
      role="log"
    >
      {messages.map((m) => {
        const messageIsPersisted =
          m._persisted ||
          (typeof m.id === "number" && isPersistedMessageId(m.id));
        return (
          <div
            key={`${m.id}-${m.role}`}
            className={m.role === "user" ? "ml-auto" : "mr-auto"}
          >
            <div
              className={`mb-1 flex gap-2 w-fit ${
                m.role === "user" ? "ml-auto" : ""
              }`}
            >
              {m.role === "ai" && m.audioUrl ? (
                <audio
                  id={`audio-${m.id}`}
                  src={resolveMediaUrl(m.audioUrl) || ""}
                  preload="metadata"
                />
              ) : null}
              {/* Always show toggles, disable + spinner if loading */}
              <>
                {/* Audio toggle (AI only) */}
                {m.role === "ai" && (
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
                    className={`px-2 py-1 text-xs rounded border cursor-pointer ${
                      m._loadingAudio
                        ? "border-[#404040] text-[#a6a6a6] opacity-50 cursor-not-allowed"
                        : playing[m.id]
                          ? "border-[#4040f2] text-[#9aa6ff]"
                          : "border-[#404040] text-[#a6a6a6]"
                    }`}
                    title={
                      m._loadingAudio
                        ? "Generating audio..."
                        : playing[m.id]
                          ? "Pause audio"
                          : "Play audio"
                    }
                  >
                    <div className="flex items-center gap-1">
                      {m._loadingAudio && (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      )}
                      <Volume2 className="w-4 h-4" />
                    </div>
                  </button>
                )}

                {/* Pinyin toggle */}
                <button
                  type="button"
                  disabled={m._loadingPinyin}
                  onClick={() => !m._loadingPinyin && onTogglePinyin(m.id)}
                  className={`px-2 py-1 text-xs rounded border ${
                    m._loadingPinyin
                      ? "border-[#404040] text-[#a6a6a6] opacity-50 cursor-not-allowed"
                      : aiShowPinyin[m.id]
                        ? "border-[#4040f2] text-[#9aa6ff]"
                        : "border-[#404040] text-[#a6a6a6]"
                  } cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#20242b]`}
                  aria-pressed={!!aiShowPinyin[m.id]}
                  aria-label={
                    m._loadingPinyin
                      ? "Loading pinyin..."
                      : aiShowPinyin[m.id]
                        ? "Hide pinyin"
                        : "Show pinyin"
                  }
                >
                  <div className="flex items-center gap-1">
                    {m._loadingPinyin && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                    <span>Pinyin {aiShowPinyin[m.id] ? "On" : "Off"}</span>
                  </div>
                </button>

                {/* Translation toggle */}
                <button
                  type="button"
                  disabled={m._loadingTranslation}
                  onClick={() =>
                    !m._loadingTranslation && onToggleTranslation(m.id)
                  }
                  className={`px-2 py-1 text-xs rounded border ${
                    m._loadingTranslation
                      ? "border-[#404040] text-[#a6a6a6] opacity-50 cursor-not-allowed"
                      : aiShowTrans[m.id]
                        ? "border-[#4040f2] text-[#9aa6ff]"
                        : "border-[#404040] text-[#a6a6a6]"
                  } cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#20242b]`}
                  aria-pressed={!!aiShowTrans[m.id]}
                  aria-label={
                    m._loadingTranslation
                      ? "Loading translation..."
                      : aiShowTrans[m.id]
                        ? "Hide translation"
                        : "Show translation"
                  }
                >
                  <div className="flex items-center gap-1">
                    {m._loadingTranslation && (
                      <Loader2 className="w-3 h-3 animate-spin" />
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

                {/* Notes toggle / Generate Notes button (AI only) */}
                {m.role === "ai" && (
                  <>
                    {/* Show notes toggle if notes exist */}
                    {m.notes?.grammarNotes?.length ||
                    (m.notes as MessageNotes)?.tipsRich?.length ? (
                      <button
                        type="button"
                        onClick={() => onToggleNotes(m.id)}
                        className={`px-2 py-1 text-xs rounded border ${
                          aiShowNotes[m.id]
                            ? "border-[#4040f2] text-[#9aa6ff]"
                            : "border-[#404040] text-[#a6a6a6]"
                        } cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#20242b]`}
                        aria-pressed={!!aiShowNotes[m.id]}
                        aria-label={
                          aiShowNotes[m.id] ? "Hide notes" : "Show notes"
                        }
                      >
                        <span>Notes {aiShowNotes[m.id] ? "On" : "Off"}</span>
                      </button>
                    ) : (
                      /* Show Generate Notes button if no notes exist */
                      onGenerateNotes &&
                      conversationId && (
                        <button
                          type="button"
                          disabled={
                            generatingNotes[m.id] || !messageIsPersisted
                          }
                          onClick={async () => {
                            if (
                              generatingNotes[m.id] ||
                              !onGenerateNotes ||
                              !messageIsPersisted
                            ) {
                              return;
                            }
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
                          className={`px-2 py-1 text-xs rounded border ${
                            generatingNotes[m.id] || !messageIsPersisted
                              ? "border-[#404040] text-[#a6a6a6] opacity-50 cursor-not-allowed"
                              : "border-blue-500/40 text-blue-400 bg-blue-500/10"
                          } cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 focus-visible:ring-offset-[#20242b]`}
                          title={
                            messageIsPersisted
                              ? undefined
                              : "Available once this reply finishes saving"
                          }
                          aria-label={
                            generatingNotes[m.id]
                              ? "Generating notes..."
                              : "Generate notes"
                          }
                        >
                          <div className="flex items-center gap-1">
                            {generatingNotes[m.id] ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3" />
                            )}
                            <span>
                              {generatingNotes[m.id]
                                ? "Generating..."
                                : "Generate Notes"}
                            </span>
                          </div>
                        </button>
                      )
                    )}
                  </>
                )}
              </>
            </div>
            <div
              className={`max-w-[85%] w-fit rounded-lg px-3 py-2 border ${
                m.role === "user"
                  ? "ml-auto bg-[#2e323a] border-[#3a3f47]"
                  : "mr-auto bg-[#26322b] border-[#35503c]"
              }`}
            >
              <AiMessage
                message={m}
                showPinyin={!!aiShowPinyin[m.id]}
                showTranslation={!!aiShowTrans[m.id]}
                showNotes={!!aiShowNotes[m.id]}
                onOpenNotesModal={onOpenNotesModal}
                containerRef={scrollRef}
              />
              <div className="text-[10px] text-[#808080] mt-1">
                {new Date(m.createdAt).toLocaleTimeString()}
              </div>
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
