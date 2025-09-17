"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout";
import {
  conversationsApi,
  type Message,
  type ConversationSummary,
} from "@/lib/api/conversations";
import { Mic, Send, Plus } from "lucide-react";
import { toast } from "sonner";

export default function ConversationsPage() {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [aiShowPinyin, setAiShowPinyin] = useState<Record<number, boolean>>({});
  const [aiShowTrans, setAiShowTrans] = useState<Record<number, boolean>>({});
  // Per-message toggles are inside AiMessage; no global toggles here
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const init = async () => {
      try {
        const list = await conversationsApi.list();
        setConversations(list);
        const saved =
          typeof window !== "undefined"
            ? localStorage.getItem("active-conversation-id")
            : null;
        const savedId = saved ? Number(saved) : null;
        if (list.length > 0) {
          const targetId = list.some((c) => c.id === savedId)
            ? (savedId as number)
            : list[0].id;
          setConversationId(targetId);
          const msgs = await conversationsApi.listMessages(targetId);
          setMessages(msgs);
        } else {
          const { id } = await conversationsApi.start();
          setConversationId(id);
          const msgs = await conversationsApi.listMessages(id);
          setMessages(msgs);
          const updated = await conversationsApi.list();
          setConversations(updated);
          if (typeof window !== "undefined")
            localStorage.setItem("active-conversation-id", String(id));
        }
      } catch {
        toast.error("Failed to load conversations");
      }
    };
    init();
  }, []);

  const selectConversation = async (id: number) => {
    if (conversationId === id) return;
    setConversationId(id);
    if (typeof window !== "undefined")
      localStorage.setItem("active-conversation-id", String(id));
    try {
      const msgs = await conversationsApi.listMessages(id);
      setMessages(msgs);
    } catch {
      toast.error("Failed to load messages");
    }
  };

  const newConversation = async () => {
    try {
      const { id } = await conversationsApi.start();
      setConversationId(id);
      const msgs = await conversationsApi.listMessages(id);
      setMessages(msgs);
      const updated = await conversationsApi.list();
      setConversations(updated);
      if (typeof window !== "undefined")
        localStorage.setItem("active-conversation-id", String(id));
    } catch {
      toast.error("Failed to start conversation");
    }
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

  const sendText = async () => {
    if (!conversationId || !input.trim()) return;
    const text = input.trim();
    setInput("");
    // Optimistic user echo
    const tempUser: Message = {
      id: Date.now(),
      role: "user",
      hanzi: text,
      pinyin: "",
      translation: "",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUser]);
    try {
      const { user } = await conversationsApi.send(conversationId, text);
      // Replace temp user with server user
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m !== tempUser);
        return [...withoutTemp, user];
      });
      // Start SSE stream
      const url = conversationsApi.streamUrl(conversationId, text);
      const es = new EventSource(url);
      const aiMsgId = Date.now() + 1;
      const createdAt = new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        {
          id: aiMsgId,
          role: "ai",
          hanzi: "",
          pinyin: "",
          translation: "",
          createdAt,
        } as Message,
      ]);
      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.hanziDelta) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? { ...m, hanzi: (m.hanzi || "") + payload.hanziDelta }
                  : m
              )
            );
          } else if (payload.type === "final" && payload.data) {
            const data = JSON.parse(payload.data);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? {
                      ...m,
                      id: data.id ?? m.id,
                      hanzi: data.hanzi || m.hanzi,
                      pinyin: data.pinyin || "",
                      translation: data.translation || "",
                      segments: Array.isArray(data.segments)
                        ? data.segments
                        : undefined,
                    }
                  : m
              )
            );
            es.close();
          }
        } catch {}
      };
      es.addEventListener("final", (e: MessageEvent) => {
        try {
          const data = JSON.parse(
            (e as unknown as MessageEvent).data as string
          );
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    id: data.id ?? m.id,
                    hanzi: data.hanzi || m.hanzi,
                    pinyin: data.pinyin || "",
                    translation: data.translation || "",
                    segments: Array.isArray(data.segments)
                      ? data.segments
                      : undefined,
                  }
                : m
            )
          );
        } catch {}
        es.close();
      });
      es.onerror = () => {
        es.close();
      };
    } catch {
      toast.error("Failed to send message");
    }
  };

  const buildFallbackSegments = (
    hanzi: string,
    pinyin?: string
  ): Array<{
    text: string;
    startIndex: number;
    endIndex: number;
    isWord: boolean;
    pinyin?: string;
  }> => {
    const chars = Array.from(hanzi || "");
    const ps = (pinyin || "").split(/\s+/).filter(Boolean);
    let pi = 0;
    const isCJK = (ch: string) => /[\u3400-\u9FFF]/.test(ch);
    const segs: Array<{
      text: string;
      startIndex: number;
      endIndex: number;
      isWord: boolean;
      pinyin?: string;
    }> = [];
    let buffer = "";
    let bufStart = 0;
    const flushBuffer = (idx: number) => {
      if (buffer.length > 0) {
        segs.push({
          text: buffer,
          startIndex: bufStart,
          endIndex: idx,
          isWord: false,
        });
        buffer = "";
      }
    };
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (isCJK(ch)) {
        flushBuffer(i);
        segs.push({
          text: ch,
          startIndex: i,
          endIndex: i + 1,
          isWord: true,
          pinyin: ps[pi++] || "",
        });
      } else {
        if (buffer.length === 0) bufStart = i;
        buffer += ch;
      }
    }
    flushBuffer(chars.length);
    return segs;
  };

  // Note: if needed, we can add an "Add to Flashcards" inline action in the popup later.

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        // const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // Placeholder: You can wire this to a speech-to-text API and set the result into input
        toast("Audio recorded. Transcription not yet implemented.");
      };
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Mic permission denied");
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
      setRecording(false);
    }
  };

  function AiMessage({
    m,
    showP,
    showT,
  }: {
    m: Message;
    showP: boolean;
    showT: boolean;
  }) {
    const [popup, setPopup] = useState<{
      open: boolean;
      x: number;
      y: number;
      word: string;
      pinyin?: string;
      definition?: string;
      definitions?: string[];
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

    const renderAligned = (hanzi: string, pinyin?: string) => {
      // If segments exist, render segment-aware with click-to-popup
      if (Array.isArray(m.segments) && m.segments.length > 0) {
        return (
          <div className="leading-8 text-white font-inter text-[16px]">
            {m.segments.map((seg, idx) => {
              const isCJK = /[\u3400-\u9FFF]/.test(seg.text || "");
              const isWord = Boolean(seg.isWord) || isCJK;
              return (
                <span
                  key={idx}
                  className={`inline-flex ${isWord ? "flex-col items-center align-top" : "items-center"} mr-[2px]`}
                >
                  {showP ? (
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
                    onClick={(e: React.MouseEvent<HTMLSpanElement>) => {
                      if (!isWord) return;
                      setPopup({
                        open: true,
                        x: e.clientX,
                        y: e.clientY,
                        word: seg.text,
                        pinyin: seg.pinyin,
                        definition: seg.definition,
                        definitions: seg.definitions,
                        tokenIndex: idx,
                      });
                    }}
                  >
                    {seg.text}
                  </span>
                </span>
              );
            })}
          </div>
        );
      }
      // Fallback to per-character alignment
      const chars = Array.from(hanzi || "");
      const ps = (pinyin || "").split(/\s+/).filter(Boolean);
      let pi = 0;
      const isCJK = (ch: string) => /[\u3400-\u9FFF]/.test(ch);
      return (
        <div className="leading-8 text-white font-inter text-[16px]">
          {chars.map((ch, idx) => {
            const top = showP && isCJK(ch) ? ps[pi] || "" : "";
            if (isCJK(ch)) pi++;
            return (
              <span
                key={idx}
                className="inline-flex flex-col items-center align-top mr-[2px]"
              >
                {top ? (
                  <span className="text-xs text-[#9aa6ff] leading-none mb-[2px]">
                    {top}
                  </span>
                ) : null}
                <span className="px-[1px] rounded">{ch}</span>
              </span>
            );
          })}
        </div>
      );
    };

    return (
      <div>
        {renderAligned(m.hanzi, m.pinyin)}
        {showT && m.translation ? (
          <div className="text-[#a6a6a6] text-xs mt-1">{m.translation}</div>
        ) : null}
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
                  // Build sentence-level context using segments and token index
                  let ctx:
                    | {
                        hanzi?: string;
                        pinyin?: string;
                        translation?: string;
                      }
                    | undefined;
                  const tokenIndex = popup.tokenIndex ?? -1;
                  if (Array.isArray(m.segments) && tokenIndex >= 0) {
                    const messageHanzi = m.hanzi || "";
                    const segments = m.segments || [];
                    const tokenStart = segments
                      .slice(0, tokenIndex)
                      .reduce((acc, s) => acc + (s.text?.length || 0), 0);
                    const hanziSentences = messageHanzi
                      .split(/(?<=[。！？!?])/)
                      .map((s) => s.trim())
                      .filter(Boolean);
                    let accLen = 0;
                    let sentenceIdx = 0;
                    for (let si = 0; si < hanziSentences.length; si++) {
                      const sTxt = hanziSentences[si];
                      const sLen = sTxt.length;
                      if (tokenStart >= accLen && tokenStart < accLen + sLen) {
                        sentenceIdx = si;
                        break;
                      }
                      accLen += sLen;
                    }
                    const chosenHanzi =
                      sentenceIdx >= 0
                        ? hanziSentences[sentenceIdx]
                        : hanziSentences[0] || messageHanzi;
                    // Rebuild per-character pinyin aligned to message hanzi
                    const pinyinTokens = (m.pinyin || "")
                      .split(/\s+/)
                      .map((s) => s.trim())
                      .filter((s) => s.length > 0);
                    const chars = Array.from(messageHanzi);
                    const perChar: string[] = new Array(chars.length).fill("");
                    let t = 0;
                    for (let i = 0; i < chars.length; i++) {
                      if (/^[\u3400-\u9FFF]$/.test(chars[i])) {
                        perChar[i] = pinyinTokens[t] || "";
                        if (pinyinTokens[t]) t++;
                      }
                    }
                    const sentStartInMsg = hanziSentences
                      .slice(0, sentenceIdx)
                      .join("").length;
                    const sentLen = chosenHanzi.length;
                    const chosenPinyin = perChar
                      .slice(sentStartInMsg, sentStartInMsg + sentLen)
                      .join(" ")
                      .trim();
                    const transSentences = (m.translation || "")
                      .split(/(?<=[.!?])\s+/)
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const chosenTrans =
                      sentenceIdx >= 0 && transSentences[sentenceIdx]
                        ? transSentences[sentenceIdx]
                        : undefined;
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
                <span className="text-sm font-inter">Add to Flashcards</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <DashboardLayout
      title="Conversations"
      subtitle="Practice natural dialogues"
    >
      <div className="p-4 h-full flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-x-auto">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => void selectConversation(c.id)}
                className={`px-2 py-1 rounded border text-xs cursor-pointer ${
                  conversationId === c.id
                    ? "border-[#4040f2] text-[#9aa6ff]"
                    : "border-[#404040] text-[#a6a6a6]"
                }`}
                title={new Date(c.startedAt).toLocaleString()}
              >
                Conv #{c.id}
              </button>
            ))}
          </div>
          <button
            onClick={() => void newConversation()}
            className="px-2 py-1 rounded bg-[#4040f2] text-white text-xs hover:bg-[#3636d9] cursor-pointer"
          >
            New Conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 bg-[#20242b] border border-[#2e2f36] rounded-xl p-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? "ml-auto" : "mr-auto"}
            >
              {m.role === "ai" ? (
                <div className="mb-1 flex gap-2">
                  <button
                    onClick={() =>
                      setAiShowPinyin((s) => ({ ...s, [m.id]: !s[m.id] }))
                    }
                    className={`px-2 py-1 text-xs rounded border ${
                      aiShowPinyin[m.id]
                        ? "border-[#4040f2] text-[#9aa6ff]"
                        : "border-[#404040] text-[#a6a6a6]"
                    } cursor-pointer`}
                  >
                    Pinyin {aiShowPinyin[m.id] ? "On" : "Off"}
                  </button>
                  <button
                    onClick={() =>
                      setAiShowTrans((s) => ({ ...s, [m.id]: !s[m.id] }))
                    }
                    className={`px-2 py-1 text-xs rounded border ${
                      aiShowTrans[m.id]
                        ? "border-[#4040f2] text-[#9aa6ff]"
                        : "border-[#404040] text-[#a6a6a6]"
                    } cursor-pointer`}
                  >
                    Translation {aiShowTrans[m.id] ? "On" : "Off"}
                  </button>
                </div>
              ) : null}
              <div
                className={`max-w-[85%] w-fit rounded-lg px-3 py-2 border ${
                  m.role === "user"
                    ? "ml-auto bg-[#2e323a] border-[#3a3f47]"
                    : "mr-auto bg-[#26322b] border-[#35503c]"
                }`}
              >
                {m.role === "ai" ? (
                  <AiMessage
                    m={{
                      ...m,
                      segments:
                        Array.isArray(m.segments) && m.segments.length > 0
                          ? m.segments
                          : buildFallbackSegments(m.hanzi, m.pinyin),
                    }}
                    showP={!!aiShowPinyin[m.id]}
                    showT={!!aiShowTrans[m.id]}
                  />
                ) : (
                  <div className="text-white font-inter text-[15px]">
                    {m.hanzi}
                  </div>
                )}
                <div className="text-[10px] text-[#808080] mt-1">
                  {new Date(m.createdAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Per-message toggles exist inside each AI message now */}
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className={`p-2 rounded-lg border transition-colors duration-200 cursor-pointer ${
              recording
                ? "bg-red-600/20 border-red-600/40 text-red-300"
                : "bg-green-600/20 border-green-600/40 text-green-300 hover:border-green-600"
            }`}
            title={recording ? "Release to stop" : "Hold to speak"}
          >
            <Mic className="w-4 h-4" />
          </button>

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendText();
            }}
            placeholder="Type your message in Chinese..."
            className="flex-1 bg-[#1a1d23] border border-[#2e323a] rounded-lg px-3 py-2 text-white outline-none"
          />
          <button
            onClick={sendText}
            className="p-2 rounded-lg bg-[#4040f2] text-white hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
