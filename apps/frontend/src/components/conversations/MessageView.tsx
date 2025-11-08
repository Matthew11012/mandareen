"use client";

import { useEffect, useRef } from "react";
import { Volume2, Loader2 } from "lucide-react";
import { AiMessage } from "./AiMessage";
import type { Message } from "@/lib/api/conversations";

interface MessageViewProps {
  messages: Message[];
  aiShowPinyin: Record<number, boolean>;
  aiShowTrans: Record<number, boolean>;
  aiShowNotes: Record<number, boolean>;
  playing: Record<number, boolean>;
  onTogglePinyin: (messageId: number) => void;
  onToggleTranslation: (messageId: number) => void;
  onToggleNotes: (messageId: number) => void;
  onToggleAudio: (
    messageId: number,
    audioElement: HTMLAudioElement | null
  ) => void;
  onOpenNotesModal: (message: Message) => void;
  resolveMediaUrl: (url?: string) => string | undefined;
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
  resolveMediaUrl,
}: MessageViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto space-y-3 sm:bg-[#20242b] sm:border sm:border-[#2e2f36] rounded-xl sm:p-4"
      aria-live="polite"
      aria-relevant="additions text"
      role="log"
    >
      {messages.map((m) => (
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
                preload="none"
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
                      onToggleAudio(m.id, el);
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

              {/* Notes toggle (AI only, show if notes exist or loading) */}
              {m.role === "ai" &&
                (m._loadingNotes || m.notes?.grammarNotes?.length) && (
                  <button
                    type="button"
                    disabled={m._loadingNotes}
                    onClick={() => !m._loadingNotes && onToggleNotes(m.id)}
                    className={`px-2 py-1 text-xs rounded border ${
                      m._loadingNotes
                        ? "border-[#404040] text-[#a6a6a6] opacity-50 cursor-not-allowed"
                        : aiShowNotes[m.id]
                          ? "border-[#4040f2] text-[#9aa6ff]"
                          : "border-[#404040] text-[#a6a6a6]"
                    } cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#20242b]`}
                    aria-pressed={!!aiShowNotes[m.id]}
                    aria-label={
                      m._loadingNotes
                        ? "Generating notes..."
                        : aiShowNotes[m.id]
                          ? "Hide notes"
                          : "Show notes"
                    }
                  >
                    <div className="flex items-center gap-1">
                      {m._loadingNotes && (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      )}
                      <span>Notes {aiShowNotes[m.id] ? "On" : "Off"}</span>
                    </div>
                  </button>
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
            />
            <div className="text-[10px] text-[#808080] mt-1">
              {new Date(m.createdAt).toLocaleTimeString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
