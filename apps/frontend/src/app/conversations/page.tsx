"use client";

import { useEffect, useRef, useState, memo } from "react";
import { DashboardLayout } from "@/components/layout";
import {
  conversationsApi,
  type Message,
  type ConversationSummary,
} from "@/lib/api/conversations";
import {
  Mic,
  Send,
  Plus,
  MessageCircle,
  ChevronLeft,
  Volume2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

// Local types to avoid `any` usages in notes rendering
type SegToken = {
  text: string;
  isWord?: boolean;
  pinyin?: string;
  definition?: string;
  definitions?: string[];
};
type Tip = { zh: string; pinyin?: string; en?: string; segments?: SegToken[] };
type GrammarNote = {
  point: string;
  pointPinyin?: string;
  pointEn?: string;
  brief: string;
  briefPinyin?: string;
  briefEn?: string;
  pointSegments?: SegToken[];
  briefSegments?: SegToken[];
  examples?: Tip[];
};
type MessageNotes = {
  grammarNotes?: GrammarNote[];
  tipsRich?: Tip[];
};

const TranslationBlock = memo(function TranslationBlock({
  show,
  text,
}: {
  show: boolean;
  text?: string;
}) {
  if (!show || !text) return null;
  return <div className="text-[#a6a6a6] text-sm mt-1">{text}</div>;
});

export default function ConversationsPage() {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [aiShowPinyin, setAiShowPinyin] = useState<Record<number, boolean>>({});
  const [aiShowTrans, setAiShowTrans] = useState<Record<number, boolean>>({});
  const [aiShowNotes, setAiShowNotes] = useState<Record<number, boolean>>({});
  const [notesModal, setNotesModal] = useState<{
    open: boolean;
    message: Message | null;
  }>({ open: false, message: null });
  // Pinyin toggle scoped to the Tutor Notes modal only
  const [notesPinyinOn, setNotesPinyinOn] = useState<boolean>(true);
  const openNotesModal = (m: Message) =>
    setNotesModal({ open: true, message: m });
  const closeNotesModal = () => setNotesModal({ open: false, message: null });
  const [playing, setPlaying] = useState<Record<number, boolean>>({});
  // Per-message toggles are inside AiMessage; no global toggles here
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [recPrompt, setRecPrompt] = useState<string>("Tap to speak");
  const [uploadingAudio, setUploadingAudio] = useState<boolean>(false);
  const apiBase = (
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"
  ).replace(/\/api$/, "");
  const resolveMediaUrl = (u?: string) => {
    if (!u) return undefined;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith("/")) return `${apiBase}${u}`;
    return `${apiBase}/${u}`;
  };

  // Popup for tutor-notes modal (separate from AiMessage popup)
  const [notesPopup, setNotesPopup] = useState<{
    open: boolean;
    x: number;
    y: number;
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    ctx?: { hanzi?: string; pinyin?: string; translation?: string };
  }>({ open: false, x: 0, y: 0, word: "" });
  const notesPopupRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        notesPopupRef.current &&
        !notesPopupRef.current.contains(e.target as Node)
      ) {
        setNotesPopup((p) => ({ ...p, open: false }));
      }
    };
    if (notesPopup.open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [notesPopup.open]);

  const renderSegmentsWithPopup = (
    segments:
      | Array<{
          text: string;
          isWord?: boolean;
          pinyin?: string;
          definition?: string;
          definitions?: string[];
        }>
      | undefined,
    baseHanzi?: string,
    baseTranslation?: string,
    showPinyin: boolean = true
  ) => {
    if (!Array.isArray(segments) || segments.length === 0) return null;
    // Build line-level pinyin by concatenating token pinyin for CJK tokens
    const linePinyin = segments
      .map((s) => (s.isWord && s.pinyin ? s.pinyin : ""))
      .filter(Boolean)
      .join(" ");
    return (
      <div className="leading-8 text-white font-inter text-[16px]">
        {segments.map((seg, idx) => {
          const isWord = Boolean(seg.isWord);
          return (
            <span
              key={idx}
              className="inline-flex flex-col items-center align-top mr-[2px]"
            >
              {showPinyin && seg.pinyin ? (
                <span className="text-xs text-[#9aa6ff] leading-none mb-[2px]">
                  {seg.pinyin}
                </span>
              ) : showPinyin ? (
                <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                  •
                </span>
              ) : null}
              <span
                className={`px-[1px] rounded ${isWord ? "hover:bg-[#404040] cursor-pointer" : ""}`}
                title={seg.definition || ""}
                onClick={(e: React.MouseEvent<HTMLSpanElement>) => {
                  if (!isWord) return;
                  setNotesPopup({
                    open: true,
                    x: e.clientX,
                    y: e.clientY,
                    word: seg.text,
                    pinyin: seg.pinyin,
                    definition: seg.definition,
                    definitions: seg.definitions,
                    ctx: {
                      hanzi: baseHanzi,
                      pinyin: linePinyin,
                      translation: baseTranslation,
                    },
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
  };

  // Mobile responsiveness state
  const [isMobile, setIsMobile] = useState(false);
  const [showConversationsSidebar, setShowConversationsSidebar] =
    useState(false);

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

  // Auto-scroll to bottom whenever messages update (new message or AI stream)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    try {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } catch {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Mobile detection and sidebar management
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // On desktop, always show sidebar. On mobile, hide by default.
      setShowConversationsSidebar(!mobile);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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

  const toggleConversationsSidebar = () => {
    setShowConversationsSidebar(!showConversationsSidebar);
  };

  const addSingleToFlashcards = async (
    hanzi: string,
    context?: { hanzi?: string; pinyin?: string; translation?: string }
  ) => {
    try {
      const { post } = await import("@/lib/http/http");
      await post("flashcards", {
        hanzi,
        sentenceHanzi: context?.hanzi,
        sentencePinyin: context?.pinyin,
        sentenceTranslation: context?.translation,
      });
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
      // Add loading flags for progressive SSE events
      _loadingPinyin: true,
      _loadingTranslation: true,
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
      const es = new EventSource(url, { withCredentials: true });

      // Flag to track if we've received the final event
      let isStreamComplete = false;
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
          // mark streaming state so toggles can be hidden until final
          segments: undefined,
          // Add loading flags for progressive SSE events
          _loadingPinyin: true,
          _loadingTranslation: true,
          _loadingAudio: true,
          _loadingNotes: true,
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
          } else if (payload.type === "ai-enrichment") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? {
                      ...m,
                      pinyin: payload.pinyin || m.pinyin,
                      segments: payload.segments || m.segments,
                      _loadingPinyin: false,
                    }
                  : m
              )
            );
          } else if (payload.type === "ai-translation") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? {
                      ...m,
                      translation: payload.translation || m.translation,
                      _loadingTranslation: false,
                    }
                  : m
              )
            );
          } else if (payload.type === "ai-audio") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? {
                      ...m,
                      audioUrl: payload.audioUrl || m.audioUrl,
                      _loadingAudio: false,
                    }
                  : m
              )
            );
          } else if (payload.type === "ai-notes") {
            const notesCamel = payload.notes
              ? {
                  grammarNotes:
                    payload.notes.grammarNotes || payload.notes.grammar_notes,
                  tipsRich: payload.notes.tipsRich || payload.notes.tips_rich,
                }
              : undefined;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? {
                      ...m,
                      notes: notesCamel || m.notes,
                      _loadingNotes: false,
                    }
                  : m
              )
            );
          } else if (
            payload &&
            typeof payload === "object" &&
            payload.id &&
            (payload.translation !== undefined || payload.segments)
          ) {
            // Some servers emit a plain user-update object on the default channel
            const data = payload as {
              id: number;
              pinyin?: string;
              translation?: string;
              segments?: Array<{
                text: string;
                startIndex: number;
                endIndex: number;
                isWord: boolean;
                hskLevel?: number;
                pinyin?: string;
                definition?: string;
                definitions?: string[];
              }>;
            };
            setMessages((prev) =>
              prev.map((m) =>
                m.role === "user" && m.id === data.id
                  ? {
                      ...m,
                      pinyin:
                        typeof data.pinyin === "string"
                          ? data.pinyin
                          : m.pinyin,
                      translation:
                        typeof data.translation === "string"
                          ? data.translation
                          : m.translation,
                      segments: Array.isArray(data.segments)
                        ? data.segments
                        : m.segments,
                    }
                  : m
              )
            );
          } else if (payload.type === "user-update" && payload.data) {
            // Ignore here to prevent double-processing; rely on named 'user-update' listener below
          } else if (payload.type === "final" && payload.data) {
            isStreamComplete = true;
            // Close the connection gracefully
            if (es.readyState === EventSource.OPEN) {
              es.close();
            }
          }
        } catch {}
      };
      es.addEventListener("user-update", (e: MessageEvent) => {
        try {
          const data = JSON.parse(
            (e as unknown as MessageEvent).data as string
          );
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.id
                ? {
                    ...m,
                    pinyin:
                      typeof data.pinyin === "string" ? data.pinyin : m.pinyin,
                    translation:
                      typeof data.translation === "string"
                        ? data.translation
                        : m.translation,
                    segments: Array.isArray(data.segments)
                      ? data.segments
                      : undefined,
                    // Clear loading flags when user enrichment arrives
                    _loadingPinyin: false,
                    _loadingTranslation: false,
                  }
                : m
            )
          );
          // Avoid destructive refetch during SSE; keep AI placeholder intact
        } catch {}
      });
      es.addEventListener("error", (e: MessageEvent) => {
        try {
          const data = JSON.parse(
            (e as unknown as MessageEvent).data as string
          );
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.id
                ? {
                    ...m,
                    pinyin:
                      typeof data.pinyin === "string" ? data.pinyin : m.pinyin,
                    translation:
                      typeof data.translation === "string"
                        ? data.translation
                        : m.translation,
                    segments: Array.isArray(data.segments)
                      ? data.segments
                      : m.segments,
                  }
                : m
            )
          );
        } catch {}
        // Hydrate AI message if no final arrived
        if (conversationId) {
          void (async () => {
            try {
              const list = await conversationsApi.listMessages(conversationId);
              const latestAi = list
                .slice()
                .reverse()
                .find((m) => m.role === "ai");
              if (latestAi) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.role === "ai" &&
                    (m.pinyin?.length === 0 || m.translation?.length === 0)
                      ? {
                          ...m,
                          hanzi: latestAi.hanzi || m.hanzi,
                          pinyin: latestAi.pinyin || m.pinyin,
                          translation: latestAi.translation || m.translation,
                          audioUrl: latestAi.audioUrl || m.audioUrl,
                          segments: Array.isArray(latestAi.segments)
                            ? latestAi.segments
                            : m.segments,
                          notes: latestAi.notes || m.notes,
                        }
                      : m
                  )
                );
              }
            } catch {}
          })();
        }
        es.close();
      });
      es.onerror = () => {
        // Only log if this is an actual error, not a normal closure
        if (isStreamComplete || es.readyState === EventSource.CLOSED) {
          // Stream closed normally, no logging needed
        } else {
          console.warn("SSE stream ended unexpectedly");
        }
        // Don't try to hydrate if we already have progressive data
        // The progressive events should have already updated the message
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
        try {
          if (!conversationId) return;
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          setUploadingAudio(true);
          const { user } = await conversationsApi.sendAudio(
            conversationId,
            blob
          );
          // Append user message
          setMessages((prev) => [...prev, user]);
          // Start SSE stream for AI reply using the transcribed hanzi
          const url = conversationsApi.streamUrl(
            conversationId,
            user.hanzi || ""
          );
          const es = new EventSource(url, { withCredentials: true });
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
              // Add loading flags for progressive SSE events
              _loadingPinyin: true,
              _loadingTranslation: true,
              _loadingAudio: true,
              _loadingNotes: true,
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
              } else if (payload.type === "ai-enrichment") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId
                      ? {
                          ...m,
                          pinyin: payload.pinyin || m.pinyin,
                          segments: payload.segments || m.segments,
                          _loadingPinyin: false,
                        }
                      : m
                  )
                );
              } else if (payload.type === "ai-translation") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId
                      ? {
                          ...m,
                          translation: payload.translation || m.translation,
                          _loadingTranslation: false,
                        }
                      : m
                  )
                );
              } else if (payload.type === "ai-audio") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId
                      ? {
                          ...m,
                          audioUrl: payload.audioUrl || m.audioUrl,
                          _loadingAudio: false,
                        }
                      : m
                  )
                );
              } else if (payload.type === "ai-notes") {
                const notesCamel = payload.notes
                  ? {
                      grammarNotes:
                        payload.notes.grammarNotes ||
                        payload.notes.grammar_notes,
                      tipsRich:
                        payload.notes.tipsRich || payload.notes.tips_rich,
                    }
                  : undefined;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId
                      ? {
                          ...m,
                          notes: notesCamel || m.notes,
                          _loadingNotes: false,
                        }
                      : m
                  )
                );
              } else if (
                payload &&
                typeof payload === "object" &&
                payload.id &&
                (payload.translation !== undefined || payload.segments)
              ) {
                const data = payload as {
                  id: number;
                  pinyin?: string;
                  translation?: string;
                  segments?: Array<{
                    text: string;
                    startIndex: number;
                    endIndex: number;
                    isWord: boolean;
                    hskLevel?: number;
                    pinyin?: string;
                    definition?: string;
                    definitions?: string[];
                  }>;
                };
                setMessages((prev) =>
                  prev.map((m) =>
                    m.role === "user" && m.id === data.id
                      ? {
                          ...m,
                          pinyin:
                            typeof data.pinyin === "string"
                              ? data.pinyin
                              : m.pinyin,
                          translation:
                            typeof data.translation === "string"
                              ? data.translation
                              : m.translation,
                          segments: Array.isArray(data.segments)
                            ? data.segments
                            : m.segments,
                        }
                      : m
                  )
                );
              } else if (payload.type === "user-update" && payload.data) {
                const data = JSON.parse(payload.data);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === data.id
                      ? {
                          ...m,
                          pinyin:
                            typeof data.pinyin === "string"
                              ? data.pinyin
                              : m.pinyin,
                          translation:
                            typeof data.translation === "string"
                              ? data.translation
                              : m.translation,
                          segments: Array.isArray(data.segments)
                            ? data.segments
                            : undefined,
                        }
                      : m
                  )
                );
              } else if (payload.type === "final" && payload.data) {
                const data = JSON.parse(payload.data);
                const notesCamel = data?.notes
                  ? {
                      grammarNotes:
                        data.notes.grammarNotes ||
                        data.notes.grammar_notes ||
                        undefined,
                      tipsRich:
                        data.notes.tipsRich ||
                        data.notes.tips_rich ||
                        undefined,
                    }
                  : undefined;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId
                      ? {
                          ...m,
                          hanzi: data.hanzi || m.hanzi,
                          pinyin: data.pinyin || "",
                          translation: data.translation || "",
                          notes: notesCamel ?? m.notes,
                          audioUrl: data.audioUrl || undefined,
                          segments: Array.isArray(data.segments)
                            ? data.segments
                            : buildFallbackSegments(
                                data.hanzi || m.hanzi,
                                data.pinyin || ""
                              ),
                        }
                      : m
                  )
                );
                es.close();
              }
            } catch {}
          };
          es.addEventListener("user-update", (e: MessageEvent) => {
            try {
              const data = JSON.parse(
                (e as unknown as MessageEvent).data as string
              );
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId || m.id === data.id
                    ? {
                        ...m,
                        pinyin:
                          typeof data.pinyin === "string"
                            ? data.pinyin
                            : m.pinyin,
                        translation:
                          typeof data.translation === "string"
                            ? data.translation
                            : m.translation,
                        segments: Array.isArray(data.segments)
                          ? data.segments
                          : undefined,
                      }
                    : m
                )
              );
            } catch {}
          });
          es.addEventListener("error", (e: MessageEvent) => {
            try {
              const data = JSON.parse(
                (e as unknown as MessageEvent).data as string
              );
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId || m.id === data.id
                    ? {
                        ...m,
                        pinyin:
                          typeof data.pinyin === "string"
                            ? data.pinyin
                            : m.pinyin,
                        translation:
                          typeof data.translation === "string"
                            ? data.translation
                            : m.translation,
                        segments: Array.isArray(data.segments)
                          ? data.segments
                          : m.segments,
                      }
                    : m
                )
              );
            } catch {}
            // Hydrate AI message if no final arrived
            if (conversationId) {
              void (async () => {
                try {
                  const list =
                    await conversationsApi.listMessages(conversationId);
                  const latestAi = list
                    .slice()
                    .reverse()
                    .find((m) => m.role === "ai");
                  if (latestAi) {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === aiMsgId
                          ? {
                              ...m,
                              hanzi: latestAi.hanzi || m.hanzi,
                              pinyin: latestAi.pinyin || m.pinyin,
                              translation:
                                latestAi.translation || m.translation,
                              audioUrl: latestAi.audioUrl || m.audioUrl,
                              segments: Array.isArray(latestAi.segments)
                                ? latestAi.segments
                                : m.segments,
                              notes: latestAi.notes || m.notes,
                            }
                          : m
                      )
                    );
                  }
                } catch {}
              })();
            }
            es.close();
          });
          es.onerror = () => {
            // Hydrate AI message if stream ended without explicit final
            if (conversationId) {
              void (async () => {
                try {
                  const list =
                    await conversationsApi.listMessages(conversationId);
                  const latestAi = list
                    .slice()
                    .reverse()
                    .find((m) => m.role === "ai");
                  if (latestAi) {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === aiMsgId
                          ? {
                              ...m,
                              hanzi: latestAi.hanzi || m.hanzi,
                              pinyin: latestAi.pinyin || m.pinyin,
                              translation:
                                latestAi.translation || m.translation,
                              audioUrl: latestAi.audioUrl || m.audioUrl,
                              segments: Array.isArray(latestAi.segments)
                                ? latestAi.segments
                                : m.segments,
                              notes: latestAi.notes || m.notes,
                            }
                          : m
                      )
                    );
                  }
                } catch {}
              })();
            }
            es.close();
          };
        } catch {
          toast.error("Failed to send audio");
        } finally {
          setUploadingAudio(false);
          setRecPrompt("Tap to speak");
        }
      };
      rec.start();
      setRecording(true);
      setRecPrompt("Listening... Tap when done");
    } catch {
      toast.error("Mic permission denied");
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
      setRecording(false);
      setRecPrompt("Processing...");
    }
  };

  function AiMessage({
    m,
    showP,
    showT,
    showN,
  }: {
    m: Message;
    showP: boolean;
    showT: boolean;
    showN: boolean;
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
                  className={`inline-flex flex-col items-center align-top mr-[2px]`}
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

    const NotesBlock = () => {
      const has =
        Array.isArray(m.notes?.grammarNotes) &&
        m.notes!.grammarNotes!.length > 0;
      if (!has) return null;
      return (
        <div className="mt-2 border border-[#3a3f47] rounded-md bg-[#1d2128] p-2">
          <div className="text-xs font-semibold text-white mb-1">
            Tutor Notes
          </div>
          <div className="space-y-3 max-h-56 overflow-hidden relative">
            {m
              .notes!.grammarNotes!.slice(0, 2)
              .map((gn: GrammarNote, idx: number) => (
                <div
                  key={idx}
                  className="text-[12px] text-[#c9d1d9] border border-[#2a2e36] bg-[#1a1f27] rounded-lg p-2 space-y-2"
                >
                  {/* Point */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[1px] rounded">
                        Point
                      </span>
                    </div>
                    <div>
                      {Array.isArray(gn.pointSegments) &&
                      gn.pointSegments.length > 0
                        ? renderSegmentsWithPopup(
                            gn.pointSegments,
                            gn.point,
                            gn.pointEn,
                            showP
                          )
                        : renderNotesPinyin(gn.point, gn.pointPinyin, showP)}
                    </div>
                    {gn.pointEn ? (
                      <div className="text-[11px] text-[#8b949e]">
                        {gn.pointEn}
                      </div>
                    ) : null}
                  </div>

                  {/* Brief */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[1px] rounded">
                        Brief
                      </span>
                    </div>
                    <div>
                      {Array.isArray(gn.briefSegments) &&
                      gn.briefSegments.length > 0
                        ? renderSegmentsWithPopup(
                            gn.briefSegments,
                            gn.brief,
                            gn.briefEn,
                            showP
                          )
                        : renderNotesPinyin(gn.brief, gn.briefPinyin, showP)}
                    </div>
                    {gn.briefEn ? (
                      <div className="text-[11px] text-[#8b949e]">
                        {gn.briefEn}
                      </div>
                    ) : null}
                  </div>

                  {/* Examples */}
                  {Array.isArray(gn.examples) && gn.examples.length > 0 ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[1px] rounded">
                          Examples
                        </span>
                      </div>
                      <ul className="space-y-1 list-disc list-outside pl-4 marker:text-[#596080]">
                        {gn.examples.map((ex: Tip, i: number) => (
                          <li key={i}>
                            {Array.isArray(ex.segments) ? (
                              renderSegmentsWithPopup(
                                ex.segments,
                                ex.zh,
                                ex.en,
                                showP
                              )
                            ) : (
                              <>
                                <div className="text-[#c9d1d9]">{ex.zh}</div>
                                {showP && ex.pinyin ? (
                                  <div className="text-[#9aa6ff] text-xs">
                                    {ex.pinyin}
                                  </div>
                                ) : null}
                                {ex.en ? (
                                  <div className="text-[#8b949e] text-xs">
                                    {ex.en}
                                  </div>
                                ) : null}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
            {m.notes!.grammarNotes!.length > 2 ? (
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#1d2128] to-transparent" />
            ) : null}
          </div>
          {Array.isArray((m.notes as MessageNotes).tipsRich) &&
          (m.notes as MessageNotes).tipsRich!.length > 0 ? (
            <div className="mt-2 pt-2 border-t border-[#2a2e36]">
              <div className="text-[10px] uppercase tracking-wide text-[#8a8f99] mb-1">
                Tips
              </div>
              <ul className="space-y-1 list-disc list-outside pl-4 marker:text-[#596080]">
                {(m.notes as MessageNotes).tipsRich!.slice(0, 2).map((t, i) => (
                  <li key={i}>
                    {Array.isArray(t.segments) && t.segments.length > 0 ? (
                      <>
                        {renderSegmentsWithPopup(
                          t.segments,
                          t.zh,
                          t.en,
                          notesPinyinOn
                        )}
                        {t.en ? (
                          <div className="text-[#8b949e] text-xs">{t.en}</div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div className="text-[#c9d1d9]">{t.zh}</div>
                        {notesPinyinOn && t.pinyin ? (
                          <div className="text-[#9aa6ff] text-xs">
                            {t.pinyin}
                          </div>
                        ) : null}
                        {t.en ? (
                          <div className="text-[#8b949e] text-xs">{t.en}</div>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-2 flex justify-between items-center">
            <div className="text-[11px] text-[#a6a6a6]">
              {Array.isArray((m.notes as MessageNotes).tipsRich) &&
              (m.notes as MessageNotes).tipsRich!.length > 0
                ? `${(m.notes as MessageNotes).tipsRich!.length} tips available`
                : null}
            </div>
            <button
              onClick={() => openNotesModal(m)}
              className="text-[11px] px-2 py-1 rounded border border-[#404040] hover:border-[#4040f2] text-[#c9d1d9] cursor-pointer"
            >
              View all notes
            </button>
          </div>
        </div>
      );
    };

    return (
      <div>
        {renderAligned(m.hanzi, m.pinyin)}
        <TranslationBlock show={showT} text={m.translation} />
        {showN ? <NotesBlock /> : null}
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

  // Render pinyin above hanzi for notes; skip non-CJK like “OK”/“Alright” tokens.
  const renderNotesPinyin = (
    hanzi?: string,
    pinyin?: string,
    showPinyin: boolean = true
  ) => {
    if (!hanzi) return null;
    const isCJK = (ch: string) => /[\u3400-\u9FFF]/.test(ch);
    const tokens = (pinyin || "")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    let pi = 0;
    const chars = Array.from(hanzi);
    return (
      <div className="leading-8 text-white font-inter text-[16px]">
        {chars.map((ch, idx) => {
          let top = "";
          if (isCJK(ch)) top = tokens[pi++] || "";
          return (
            <span
              key={idx}
              className="inline-flex flex-col items-center align-top mr-[2px]"
            >
              {showPinyin && top ? (
                <span className="text-xs text-[#9aa6ff] leading-none mb-[2px]">
                  {top}
                </span>
              ) : (
                <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                  •
                </span>
              )}
              <span className="px-[1px] rounded">{ch}</span>
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <DashboardLayout
      title="Conversations"
      subtitle="Practice natural dialogues"
    >
      <div className="p-4 h-full flex gap-4 relative">
        {/* Mobile Overlay */}
        {isMobile && showConversationsSidebar && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={toggleConversationsSidebar}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`bg-[#1b1f26] border border-[#2a2e36] rounded-xl p-3 flex flex-col gap-3 transition-all duration-300 ease-in-out ${
            isMobile
              ? `fixed inset-y-0 left-0 z-50 w-64 ${
                  showConversationsSidebar
                    ? "translate-x-0"
                    : "-translate-x-full"
                }`
              : showConversationsSidebar
                ? "w-64 shrink-0"
                : "w-64 shrink-0"
          }`}
        >
          <div className="px-2 text-xs uppercase tracking-wide text-[#8a8f99]">
            Conversations
          </div>
          <div className="flex flex-col gap-1 overflow-y-auto max-h-[60vh] pr-1">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  void selectConversation(c.id);
                  if (isMobile) {
                    setShowConversationsSidebar(false);
                  }
                }}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors duration-150 cursor-pointer ${
                  conversationId === c.id
                    ? "bg-[#232838] border-[#4040f2] text-[#c7cdff]"
                    : "bg-[#20242b] border-[#2e323a] text-[#a6a6a6] hover:border-[#4040f2]"
                }`}
                title={new Date(c.startedAt).toLocaleString()}
              >
                <div className="text-sm font-medium">Conversation #{c.id}</div>
                <div className="text-[10px] text-[#808080]">
                  {new Date(c.startedAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              void newConversation();
              if (isMobile) {
                setShowConversationsSidebar(false);
              }
            }}
            className="mt-auto w-full py-2 rounded-lg bg-[#4040f2] text-white text-sm hover:bg-[#3636d9] cursor-pointer"
          >
            + New Conversation
          </button>
        </aside>

        {/* Conversations Toggle Button */}
        {isMobile && (
          <button
            onClick={toggleConversationsSidebar}
            className={`fixed z-30 p-3 rounded-lg transition-all duration-200 cursor-pointer md:hidden ${
              showConversationsSidebar
                ? "top-20 left-4 bg-[#4040f2] hover:bg-[#3636d9] shadow-lg"
                : "top-22 left-4 bg-[#1b1f26] border border-[#2a2e36] hover:bg-[#232838] hover:border-[#4040f2]"
            }`}
            title={
              showConversationsSidebar
                ? "Hide conversations"
                : "Show conversations"
            }
            type="button"
            aria-pressed={showConversationsSidebar}
            aria-label={
              showConversationsSidebar
                ? "Hide conversations"
                : "Show conversations"
            }
          >
            <div className="flex items-center gap-2">
              {showConversationsSidebar ? (
                <ChevronLeft
                  className="w-4 h-4 text-white"
                  aria-hidden="true"
                />
              ) : (
                <MessageCircle
                  className="w-4 h-4 text-[#a6a6a6]"
                  aria-hidden="true"
                />
              )}
              <span
                className={`text-xs font-inter ${
                  showConversationsSidebar ? "text-white" : "text-[#a6a6a6]"
                }`}
              >
                {showConversationsSidebar ? "Hide" : "Chats"}
              </span>
            </div>
          </button>
        )}

        {/* Main chat column */}
        <div
          className={`flex-1 h-full flex flex-col gap-3 transition-all duration-300 ease-in-out ${
            isMobile && showConversationsSidebar ? "hidden" : ""
          }`}
        >
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto space-y-3 bg-[#20242b] border border-[#2e2f36] rounded-xl p-4"
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
                      src={resolveMediaUrl(m.audioUrl)}
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
                            if (!el) return;
                            if (el.paused) {
                              void el.play();
                              setPlaying((s) => ({ ...s, [m.id]: true }));
                              el.onended = () =>
                                setPlaying((s) => ({ ...s, [m.id]: false }));
                            } else {
                              el.pause();
                              setPlaying((s) => ({ ...s, [m.id]: false }));
                            }
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
                      onClick={() =>
                        !m._loadingPinyin &&
                        setAiShowPinyin((s) => ({ ...s, [m.id]: !s[m.id] }))
                      }
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
                        !m._loadingTranslation &&
                        setAiShowTrans((s) => ({ ...s, [m.id]: !s[m.id] }))
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
                          onClick={() =>
                            !m._loadingNotes &&
                            setAiShowNotes((s) => ({ ...s, [m.id]: !s[m.id] }))
                          }
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
                            <span>
                              Notes {aiShowNotes[m.id] ? "On" : "Off"}
                            </span>
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
                    m={{
                      ...m,
                      segments:
                        Array.isArray(m.segments) && m.segments.length > 0
                          ? m.segments
                          : buildFallbackSegments(m.hanzi, m.pinyin),
                    }}
                    showP={!!aiShowPinyin[m.id]}
                    showT={!!aiShowTrans[m.id]}
                    showN={!!aiShowNotes[m.id]}
                  />
                  <div className="text-[10px] text-[#808080] mt-1">
                    {new Date(m.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full flex-wrap">
            <button
              onClick={() => {
                if (!recording) startRecording();
                else stopRecording();
              }}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors duration-200 cursor-pointer max-w-full ${
                recording
                  ? "bg-red-600/10 border-red-600/40 text-red-200"
                  : "bg-[#1b1f26] border-[#2e323a] text-[#a6a6a6] hover:border-[#4040f2]"
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#1b1f26]`}
              title={recording ? "Tap when done" : "Tap to speak"}
              type="button"
              aria-pressed={recording}
              aria-label={recording ? "Stop recording" : "Start recording"}
            >
              <div className="relative shrink-0">
                <div
                  className={`rounded-full p-2 ${
                    recording ? "bg-red-600/20" : "bg-green-600/20"
                  }`}
                >
                  <Mic className="w-4 h-4" />
                </div>
                {recording ? (
                  <span className="absolute inset-0 rounded-full ring-2 ring-red-500 motion-safe:animate-ping" />
                ) : null}
              </div>
              <div className="flex flex-col items-start min-w-0 overflow-hidden hidden sm:block">
                <span className="text-xs font-medium text-white truncate max-w-[55vw] sm:max-w-none">
                  {recPrompt}
                </span>
                <span className="text-[10px] text-[#808080] hidden sm:block">
                  {recording
                    ? "Start speaking • Tap when done"
                    : "Mic uses your browser audio"}
                </span>
              </div>
              {uploadingAudio ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2 shrink-0" />
              ) : null}
            </button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendText();
              }}
              placeholder="Type your message ..."
              className="flex-1 min-w-0 bg-[#1a1d23] border border-[#2e323a] rounded-lg px-3 py-2 text-white outline-none"
            />
            <button
              onClick={sendText}
              className="px-4 py-2 rounded-lg bg-[#4040f2] text-white text-sm hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer shrink-0"
              type="button"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {notesModal.open && notesModal.message ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeNotesModal}
          />
          <div className="relative z-50 max-h-[80vh] w-[90vw] max-w-2xl bg-[#1d2128] border border-[#3a3f47] rounded-lg shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2e36] shrink-0">
              <div className="text-sm font-semibold text-white">
                Tutor Notes
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setNotesPinyinOn((v) => !v)}
                  className={`px-2 py-1 text-xs rounded border ${
                    notesPinyinOn
                      ? "border-[#4040f2] text-[#9aa6ff]"
                      : "border-[#404040] text-[#a6a6a6]"
                  } cursor-pointer`}
                >
                  Pinyin {notesPinyinOn ? "On" : "Off"}
                </button>
                <button
                  onClick={closeNotesModal}
                  className="text-[#a6a6a6] text-xs hover:text-white cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {Array.isArray(notesModal.message.notes?.grammarNotes) &&
                notesModal.message.notes!.grammarNotes!.map(
                  (
                    gn: GrammarNote & {
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
                      examples?: Array<
                        Tip & {
                          segments?: Array<{
                            text: string;
                            isWord?: boolean;
                            pinyin?: string;
                            definition?: string;
                            definitions?: string[];
                          }>;
                        }
                      >;
                    },
                    idx: number
                  ) => (
                    <div
                      key={idx}
                      className="text-sm text-[#c9d1d9] border border-[#2a2e36] bg-[#1a1f27] rounded-lg p-3 space-y-3"
                    >
                      {/* Point */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[2px] rounded">
                            Point
                          </span>
                        </div>
                        <div>
                          {Array.isArray(gn.pointSegments) &&
                          gn.pointSegments.length > 0
                            ? renderSegmentsWithPopup(
                                gn.pointSegments,
                                gn.point,
                                gn.pointEn,
                                notesPinyinOn
                              )
                            : renderNotesPinyin(
                                gn.point,
                                gn.pointPinyin,
                                notesPinyinOn
                              )}
                        </div>
                        {gn.pointEn ? (
                          <div className="text-xs text-[#8b949e]">
                            {gn.pointEn}
                          </div>
                        ) : null}
                      </div>

                      {/* Brief */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[2px] rounded">
                            Brief
                          </span>
                        </div>
                        <div>
                          {Array.isArray(gn.briefSegments) &&
                          gn.briefSegments.length > 0
                            ? renderSegmentsWithPopup(
                                gn.briefSegments,
                                gn.brief,
                                gn.briefEn,
                                notesPinyinOn
                              )
                            : renderNotesPinyin(
                                gn.brief,
                                gn.briefPinyin,
                                notesPinyinOn
                              )}
                        </div>
                        {gn.briefEn ? (
                          <div className="text-xs text-[#8b949e]">
                            {gn.briefEn}
                          </div>
                        ) : null}
                      </div>

                      {/* Examples */}
                      {Array.isArray(gn.examples) && gn.examples.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[2px] rounded">
                              Examples
                            </span>
                          </div>
                          <ul className="space-y-2 list-disc list-outside pl-5 marker:text-[#596080]">
                            {gn.examples.map((ex: Tip, i: number) => (
                              <li key={i}>
                                {Array.isArray(ex.segments) ? (
                                  <>
                                    {renderSegmentsWithPopup(
                                      ex.segments,
                                      ex.zh,
                                      ex.en,
                                      notesPinyinOn
                                    )}
                                    {ex.en ? (
                                      <div className="text-[#8b949e] text-xs">
                                        {ex.en}
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <>
                                    <div className="text-[#c9d1d9]">
                                      {ex.zh}
                                    </div>
                                    {notesPinyinOn && ex.pinyin ? (
                                      <div className="text-[#9aa6ff] text-xs">
                                        {ex.pinyin}
                                      </div>
                                    ) : null}
                                    {ex.en ? (
                                      <div className="text-[#8b949e] text-xs">
                                        {ex.en}
                                      </div>
                                    ) : null}
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  )
                )}
              {Array.isArray(
                (notesModal.message.notes as MessageNotes)?.tipsRich
              ) &&
              (notesModal.message.notes as MessageNotes).tipsRich!.length >
                0 ? (
                <div className="pt-2 border-t border-[#2a2e36]">
                  <div className="text-sm font-semibold text-white mb-2">
                    Tips
                  </div>
                  <ul className="space-y-2 list-disc list-outside pl-5 marker:text-[#596080]">
                    {(notesModal.message.notes as MessageNotes).tipsRich!.map(
                      (t: Tip, i: number) => (
                        <li key={i}>
                          {Array.isArray(t.segments) &&
                          t.segments.length > 0 ? (
                            <>
                              {renderSegmentsWithPopup(
                                t.segments,
                                t.zh,
                                t.en,
                                notesPinyinOn
                              )}
                              {t.en ? (
                                <div className="text-[#8b949e] text-xs">
                                  {t.en}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <div className="text-[#c9d1d9]">{t.zh}</div>
                              {t.pinyin ? (
                                <div className="text-[#9aa6ff] text-xs">
                                  {t.pinyin}
                                </div>
                              ) : null}
                              {t.en ? (
                                <div className="text-[#8b949e] text-xs">
                                  {t.en}
                                </div>
                              ) : null}
                            </>
                          )}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              ) : null}
            </div>
            {notesPopup.open && (
              <div
                ref={notesPopupRef}
                style={{
                  position: "fixed",
                  left: Math.max(
                    10,
                    Math.min(notesPopup.x - 110, window.innerWidth - 260)
                  ),
                  top: Math.max(10, notesPopup.y - 150),
                  zIndex: 1000,
                }}
                className="bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
              >
                <div className="font-bold text-white text-lg truncate">
                  {notesPopup.word}
                </div>
                {notesPopup.pinyin ? (
                  <div className="text-[#c6ceff] text-sm font-medium truncate">
                    {notesPopup.pinyin}
                  </div>
                ) : null}
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
                    onClick={() => {
                      void addSingleToFlashcards(
                        notesPopup.word,
                        notesPopup.ctx
                      );
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
        </div>
      ) : null}
    </DashboardLayout>
  );
}
