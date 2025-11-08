"use client";

import { useEffect, useRef, useState, memo, useMemo, useCallback } from "react";
import { DashboardLayout } from "@/components/layout";
import {
  conversationsApi,
  type Message,
  type ConversationSummary,
} from "@/lib/api/conversations";
import { useConversationStream } from "@/lib/hooks/use-conversation-stream";
import { useAudioRecorder } from "@/lib/hooks/use-audio-recorder";
import {
  useConversationsList,
  useMessages,
  useStartConversation,
  useSendMessage,
  sortConversationsByStartedAt,
} from "@/lib/hooks/use-conversations";
import { buildFallbackSegments } from "@/lib/utils/segments";
import {
  addSingleToFlashcards,
  getSentenceContext,
} from "@/lib/utils/flashcards";
import {
  Mic,
  Send,
  Plus,
  MessageCircle,
  ChevronLeft,
  Volume2,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";

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

// Enriched conversation type with optional preview
type EnrichedConversation = ConversationSummary & { preview?: string };

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
  const [conversations, setConversations] = useState<EnrichedConversation[]>(
    []
  );
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [loadingPreviews, setLoadingPreviews] = useState<boolean>(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    conversationId: number | null;
  }>({ open: false, conversationId: null });
  const [deleting, setDeleting] = useState<boolean>(false);
  const deleteModalRef = useRef<HTMLDivElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Hooks
  const { streamText, streamAudio } = useConversationStream();
  const { data: conversationsList, refetch: refetchConversations } =
    useConversationsList();
  const { data: messagesData, refetch: refetchMessages } =
    useMessages(conversationId);
  const startConversationMutation = useStartConversation();
  const sendMessageMutation = useSendMessage();

  // Helper to create stream callbacks for updating messages state
  type _NotesType = NonNullable<Message["notes"]>;
  type _GrammarNotesType = _NotesType["grammarNotes"];
  type _TipsRichType = _NotesType["tipsRich"];
  const createStreamCallbacks = useCallback(
    (aiMsgId: number) => {
      // Track the target AI message id; start with caller-provided id, but
      // switch to the id provided by onStart to ensure consistency with the stream
      let targetId = aiMsgId;
      return {
        onStart: ({ id, createdAt }: { id: number; createdAt: string }) => {
          targetId = id;
          setMessages((prev) => [
            ...prev,
            {
              id,
              role: "ai" as const,
              hanzi: "",
              pinyin: "",
              translation: "",
              createdAt,
              segments: undefined,
              _loadingPinyin: true,
              _loadingTranslation: true,
              _loadingAudio: true,
              _loadingNotes: true,
            } as Message,
          ]);
        },
        onHanziDelta: (delta: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === targetId ? { ...m, hanzi: (m.hanzi || "") + delta } : m
            )
          );
        },
        onAiEnrichment: (pinyin?: string, segments?: Message["segments"]) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === targetId
                ? {
                    ...m,
                    pinyin: pinyin || m.pinyin,
                    segments: segments || m.segments,
                    _loadingPinyin: false,
                  }
                : m
            )
          );
        },
        onAiTranslation: (translation?: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === targetId
                ? {
                    ...m,
                    translation: translation || m.translation,
                    _loadingTranslation: false,
                  }
                : m
            )
          );
        },
        onAiAudio: (audioUrl?: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === targetId
                ? {
                    ...m,
                    audioUrl: audioUrl || m.audioUrl,
                    _loadingAudio: false,
                  }
                : m
            )
          );
        },
        onAiNotes: (notes?: unknown) => {
          // Normalize notes payload from stream into Message["notes"] shape
          let normalized: Message["notes"] | undefined = undefined;
          if (notes && typeof notes === "object") {
            const r = notes as Record<string, unknown>;
            const rawGN = r["grammarNotes"] as _GrammarNotesType | undefined;
            const rawTR = r["tipsRich"] as unknown;
            const mappedTR = Array.isArray(rawTR)
              ? typeof rawTR[0] === "string"
                ? (rawTR as string[]).map((zh) => ({ zh }))
                : (rawTR as NonNullable<_TipsRichType>)
              : undefined;
            normalized = {
              grammarNotes: rawGN,
              tipsRich: mappedTR,
            } as Message["notes"];
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === targetId
                ? {
                    ...m,
                    notes: normalized || m.notes,
                    _loadingNotes: false,
                  }
                : m
            )
          );
        },
        // Let onError handle hydration fallback; final event is not strictly required here
        onUserUpdate: (update: {
          id: number;
          pinyin?: string;
          translation?: string;
          segments?: Message["segments"];
        }) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.role === "user" && m.id === update.id
                ? {
                    ...m,
                    pinyin:
                      typeof update.pinyin === "string"
                        ? update.pinyin
                        : m.pinyin,
                    translation:
                      typeof update.translation === "string"
                        ? update.translation
                        : m.translation,
                    segments: Array.isArray(update.segments)
                      ? update.segments
                      : m.segments,
                    _loadingPinyin: false,
                    _loadingTranslation: false,
                  }
                : m
            )
          );
        },
        onFinal: (final: {
          hanzi?: string;
          pinyin?: string;
          translation?: string;
          audioUrl?: string;
          segments?: Message["segments"];
          notes?: unknown;
        }) => {
          // Normalize notes from FinalPayload (NotesPayload) to Message["notes"]
          let normalizedNotes: Message["notes"] | undefined = undefined;
          if (final.notes && typeof final.notes === "object") {
            const r = final.notes as Record<string, unknown>;
            const rawGN = r["grammarNotes"] as _GrammarNotesType | undefined;
            const rawTR = r["tipsRich"] as unknown;
            const mappedTR = Array.isArray(rawTR)
              ? typeof rawTR[0] === "string"
                ? (rawTR as string[]).map((zh) => ({ zh }))
                : (rawTR as NonNullable<_TipsRichType>)
              : undefined;
            normalizedNotes = {
              grammarNotes: rawGN,
              tipsRich: mappedTR,
            } as Message["notes"];
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === targetId
                ? {
                    ...m,
                    hanzi: final.hanzi || m.hanzi,
                    pinyin: final.pinyin || m.pinyin || "",
                    translation: final.translation || m.translation || "",
                    audioUrl: final.audioUrl || m.audioUrl,
                    segments: Array.isArray(final.segments)
                      ? final.segments
                      : final.segments === undefined && m.segments
                        ? m.segments
                        : buildFallbackSegments(
                            final.hanzi || m.hanzi || "",
                            final.pinyin || m.pinyin || ""
                          ),
                    notes: normalizedNotes ?? m.notes,
                    _loadingPinyin: false,
                    _loadingTranslation: false,
                    _loadingAudio: false,
                    _loadingNotes: false,
                  }
                : m
            )
          );
        },
        onError: async () => {
          // Hydrate AI message if stream ended without explicit final
          if (conversationId) {
            try {
              const list = await conversationsApi.listMessages(conversationId);
              const latestAi = list
                .slice()
                .reverse()
                .find((m) => m.role === "ai");
              if (latestAi) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === targetId
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
                          _loadingPinyin: false,
                          _loadingTranslation: false,
                          _loadingAudio: false,
                          _loadingNotes: false,
                        }
                      : m
                  )
                );
              }
            } catch {
              // ignore
            }
          }
        },
      };
    },
    [conversationId]
  );

  const {
    start: startRecording,
    stop: stopRecording,
    recording,
    recPrompt,
    uploadingAudio,
  } = useAudioRecorder({
    onData: async (blob) => {
      if (!conversationId) return;
      try {
        // Upload audio first to get user message (with transcribed hanzi)
        const { user } = await conversationsApi.sendAudio(conversationId, blob);
        setMessages((prev) => [...prev, user]);
        // Then start streaming AI reply (hook will handle SSE)
        // Note: streamAudio hook also calls sendAudio, but that's okay - server handles idempotency
        const aiMsgId = Date.now() + 1;
        await streamAudio(
          { conversationId, audio: blob },
          createStreamCallbacks(aiMsgId)
        );
      } catch {
        toast.error("Failed to send audio");
      }
    },
  });

  // Memoized date formatter utility
  const formatConversationDate = useMemo(
    () =>
      (dateStr: string): string => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 7) return `${diffDays} days ago`;

        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      },
    []
  );

  // Load conversation previews in parallel
  const loadConversationPreviews = async (
    convos: ConversationSummary[]
  ): Promise<EnrichedConversation[]> => {
    // Sort by most recent first
    const sorted = [...convos].sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );

    // Fetch previews for first 15 conversations in parallel
    const previews = await Promise.allSettled(
      sorted.slice(0, 15).map(async (conv) => {
        try {
          const messages = await conversationsApi.listMessages(conv.id);
          const firstUserMsg = messages.find((m) => m.role === "user");
          // Use first user message as title, truncate if too long
          const preview = firstUserMsg?.hanzi
            ? firstUserMsg.hanzi.length > 60
              ? firstUserMsg.hanzi.substring(0, 60) + "..."
              : firstUserMsg.hanzi
            : "New conversation";
          return { ...conv, preview };
        } catch {
          return { ...conv, preview: undefined };
        }
      })
    );

    return previews.map((result, idx) =>
      result.status === "fulfilled"
        ? result.value
        : { ...sorted[idx], preview: undefined }
    );
  };
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
  const notesMobilePopupRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedInsideDesktop = notesPopupRef.current?.contains(target);
      const clickedInsideMobile = notesMobilePopupRef.current?.contains(target);
      // Only close if click is outside both popups
      if (!clickedInsideDesktop && !clickedInsideMobile) {
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

  // Sync conversations list from query to local state (for preview enrichment)
  useEffect(() => {
    if (conversationsList) {
      setConversations(conversationsList);
      // Load previews in background
      setLoadingPreviews(true);
      loadConversationPreviews(conversationsList)
        .then((enriched) => {
          setConversations(enriched);
          setLoadingPreviews(false);
        })
        .catch(() => {
          setLoadingPreviews(false);
        });
    }
  }, [conversationsList]);

  // Sync messages from query to local state
  useEffect(() => {
    if (messagesData) {
      setMessages(messagesData);
    }
  }, [messagesData]);

  // Initial load: select conversation or create new one
  useEffect(() => {
    if (!conversationsList) return;
    const saved =
      typeof window !== "undefined"
        ? localStorage.getItem("active-conversation-id")
        : null;
    const savedId = saved ? Number(saved) : null;
    if (conversationsList.length > 0) {
      const sorted = sortConversationsByStartedAt(conversationsList);
      const targetId = conversationsList.some((c) => c.id === savedId)
        ? (savedId as number)
        : sorted[0].id;
      if (conversationId !== targetId) {
        setConversationId(targetId);
        if (typeof window !== "undefined")
          localStorage.setItem("active-conversation-id", String(targetId));
      }
    } else {
      // No conversations, create new one
      startConversationMutation.mutate(undefined, {
        onSuccess: async ({ id }) => {
          setConversationId(id);
          if (typeof window !== "undefined")
            localStorage.setItem("active-conversation-id", String(id));
          await refetchConversations();
        },
        onError: () => {
          toast.error("Failed to start conversation");
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationsList, startConversationMutation, refetchConversations]);

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

  // Keyboard handling for delete confirmation modal
  useEffect(() => {
    if (!deleteConfirm.open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) {
        setDeleteConfirm({ open: false, conversationId: null });
        // Return focus to trigger button
        deleteTriggerRef.current?.focus();
      }
      if (e.key === "Enter" && e.target === cancelButtonRef.current) {
        e.preventDefault();
        if (!deleting) {
          setDeleteConfirm({ open: false, conversationId: null });
          deleteTriggerRef.current?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Focus first button when modal opens
    setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 100);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [deleteConfirm.open, deleting]);

  const selectConversation = async (id: number) => {
    if (conversationId === id) return;
    setConversationId(id);
    if (typeof window !== "undefined")
      localStorage.setItem("active-conversation-id", String(id));
    // Messages will be loaded via useMessages hook when conversationId changes
    await refetchMessages();
  };

  const newConversation = async () => {
    try {
      const { id } = await startConversationMutation.mutateAsync(undefined);
      setConversationId(id);
      if (typeof window !== "undefined")
        localStorage.setItem("active-conversation-id", String(id));
      await refetchConversations();
      await refetchMessages();
    } catch {
      toast.error("Failed to start conversation");
    }
  };

  const handleDeleteConversation = async (id: number) => {
    if (deleting) return;

    const wasActive = conversationId === id;
    const deletedIndex = conversations.findIndex((c) => c.id === id);
    const deletedItem = conversations[deletedIndex];

    // Optimistic removal
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated);

    // If deleting active conversation, switch to next most recent or create new
    if (wasActive) {
      if (updated.length > 0) {
        const sorted = [...updated].sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        );
        const nextId = sorted[0].id;
        setConversationId(nextId);
        try {
          const msgs = await conversationsApi.listMessages(nextId);
          setMessages(msgs);
          if (typeof window !== "undefined")
            localStorage.setItem("active-conversation-id", String(nextId));
        } catch {
          toast.error("Failed to load next conversation");
        }
      } else {
        // No conversations left, create new one
        setConversationId(null);
        setMessages([]);
        try {
          const { id: newId } = await conversationsApi.start();
          setConversationId(newId);
          const msgs = await conversationsApi.listMessages(newId);
          setMessages(msgs);
          const freshList = await conversationsApi.list();
          setConversations(freshList);
          loadConversationPreviews(freshList).then((enriched) => {
            setConversations(enriched);
          });
          if (typeof window !== "undefined")
            localStorage.setItem("active-conversation-id", String(newId));
        } catch {
          toast.error("Failed to create new conversation");
        }
      }
    }

    // Perform actual delete
    setDeleting(true);
    try {
      await conversationsApi.delete(id);
      toast.success("Conversation deleted", {
        duration: 3000,
      });
      setDeleteConfirm({ open: false, conversationId: null });
      // Focus moves to next conversation automatically via selectConversation
    } catch {
      // Rollback on failure
      const restored = [...conversations];
      restored.splice(deletedIndex, 0, deletedItem);
      setConversations(restored);

      if (wasActive) {
        setConversationId(id);
        try {
          const msgs = await conversationsApi.listMessages(id);
          setMessages(msgs);
          if (typeof window !== "undefined")
            localStorage.setItem("active-conversation-id", String(id));
        } catch {
          toast.error("Failed to restore conversation");
        }
      }

      toast.error("Failed to delete conversation");
      setDeleteConfirm({ open: false, conversationId: null });
      // Focus the restored item for accessibility after modal closes
      setTimeout(() => {
        const restoredButton = document.querySelector(
          `[data-conversation-id="${id}"] button`
        ) as HTMLButtonElement | null;
        restoredButton?.focus();
      }, 100);
    } finally {
      setDeleting(false);
    }
  };

  const toggleConversationsSidebar = () => {
    setShowConversationsSidebar(!showConversationsSidebar);
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
      const { user } = await sendMessageMutation.mutateAsync({
        id: conversationId,
        hanzi: text,
      });
      // Replace temp user with server user
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m !== tempUser);
        return [...withoutTemp, user];
      });
      // Start SSE stream using hook
      const aiMsgId = Date.now() + 1;
      await streamText(
        { conversationId, text },
        createStreamCallbacks(aiMsgId)
      );
    } catch {
      toast.error("Failed to send message");
    }
  };

  // Note: if needed, we can add an "Add to Flashcards" inline action in the popup later.

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
    const mobilePopupRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      const onClick = (e: MouseEvent) => {
        const target = e.target as Node;
        const clickedInsideDesktop = popupRef.current?.contains(target);
        const clickedInsideMobile = mobilePopupRef.current?.contains(target);
        // Only close if click is outside both popups
        if (!clickedInsideDesktop && !clickedInsideMobile) {
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
            className="hidden sm:block bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
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
                  const tokenIndex = popup.tokenIndex ?? -1;
                  const ctx =
                    tokenIndex >= 0
                      ? getSentenceContext(m, tokenIndex)
                      : undefined;
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

        {/* Mobile top sheet popup for AiMessage */}
        <AnimatePresence>
          {popup.open && (
            <motion.div
              ref={mobilePopupRef}
              initial={{ y: "-100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-100%" }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
                duration: 0.3,
              }}
              className="sm:hidden fixed inset-x-0 top-0 z-40 bg-[#1a1d23]/95 backdrop-blur border-b border-[#2e323a] p-4"
            >
              <div className="max-w-sm mx-auto">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="font-bold text-white text-lg truncate">
                    {popup.word}
                  </div>
                </div>
                {popup.pinyin && (
                  <div className="text-[#c6ceff] text-sm font-medium truncate mb-2">
                    {popup.pinyin}
                  </div>
                )}
                {Array.isArray(popup.definitions) &&
                popup.definitions.length > 0 ? (
                  <div className="text-xs text-[#a6a6a6] mb-3 space-y-1">
                    {popup.definitions.map((d, i) => (
                      <div key={i}>• {d}</div>
                    ))}
                  </div>
                ) : popup.definition ? (
                  <div className="text-xs text-[#a6a6a6] mb-3">
                    {popup.definition}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setPopup((p) => ({ ...p, open: false }));
                    }}
                    className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] text-[#a6a6a6] cursor-pointer text-sm"
                  >
                    Close
                  </button>
                  <button
                    onClick={async () => {
                      // Build sentence-level context using segments and token index
                      const tokenIndex = popup.tokenIndex ?? -1;
                      const ctx =
                        tokenIndex >= 0
                          ? getSentenceContext(m, tokenIndex)
                          : undefined;
                      await addSingleToFlashcards(popup.word, ctx);
                      setPopup((p) => ({ ...p, open: false }));
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer"
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
          <div className="flex flex-col gap-1 overflow-y-auto max-h-[75vh] pr-1">
            {loadingPreviews && conversations.length === 0 ? (
              <div className="text-xs text-[#808080] px-3 py-2">
                Loading conversations...
              </div>
            ) : (
              (() => {
                // Group conversations by time period
                const now = new Date();
                const weekAgo = new Date(
                  now.getTime() - 7 * 24 * 60 * 60 * 1000
                );
                const monthAgo = new Date(
                  now.getTime() - 30 * 24 * 60 * 60 * 1000
                );

                const recent: EnrichedConversation[] = [];
                const lastMonth: EnrichedConversation[] = [];
                const older: EnrichedConversation[] = [];

                conversations.forEach((c) => {
                  const date = new Date(c.startedAt);
                  if (date >= weekAgo) {
                    recent.push(c);
                  } else if (date >= monthAgo) {
                    lastMonth.push(c);
                  } else {
                    older.push(c);
                  }
                });

                return (
                  <>
                    {recent.length > 0 && (
                      <>
                        <div className="text-[10px] uppercase tracking-wide text-[#8a8f99] px-3 py-1.5 mt-2">
                          Recent ({recent.length})
                        </div>
                        {recent.map((c) => (
                          <div
                            key={c.id}
                            className={`group relative w-full px-3 py-2 rounded-lg border transition-colors duration-150 ${
                              conversationId === c.id
                                ? "bg-[#2d3548] border-[#4040f2] text-[#c7cdff] shadow-sm"
                                : "bg-[#20242b] border-[#2e323a] text-[#a6a6a6] hover:bg-[#252932] hover:border-[#4040f2]"
                            }`}
                            data-conversation-id={c.id}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void selectConversation(c.id);
                                  if (isMobile) {
                                    setShowConversationsSidebar(false);
                                  }
                                }}
                                className="flex-1 text-left min-w-0 cursor-pointer"
                                title={
                                  c.preview ||
                                  new Date(c.startedAt).toLocaleString()
                                }
                                aria-label={`${c.preview || "Conversation"} from ${formatConversationDate(c.startedAt)}`}
                              >
                                <div className="text-base font-medium truncate w-full">
                                  {c.preview || `Conversation #${c.id}`}
                                </div>
                                <div className="text-[10px] text-[#808080]">
                                  {formatConversationDate(c.startedAt)}
                                </div>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteTriggerRef.current = e.currentTarget;
                                  setDeleteConfirm({
                                    open: true,
                                    conversationId: c.id,
                                  });
                                }}
                                className={`flex items-center justify-center w-6 h-6 rounded transition-colors duration-150 cursor-pointer touch-manipulation ${
                                  conversationId === c.id
                                    ? "text-[#c7cdff] hover:bg-red-600/20 hover:text-red-400"
                                    : "text-[#808080] hover:bg-red-600/20 hover:text-red-400"
                                }`}
                                aria-label="Delete conversation"
                                title="Delete conversation"
                              >
                                <Trash2
                                  className="w-4 h-4"
                                  aria-hidden="true"
                                />
                              </button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {lastMonth.length > 0 && (
                      <>
                        <div className="text-[10px] uppercase tracking-wide text-[#8a8f99] px-3 py-1.5 mt-2">
                          Last 30 Days ({lastMonth.length})
                        </div>
                        {lastMonth.map((c) => (
                          <div
                            key={c.id}
                            className={`group relative w-full px-3 py-2 rounded-lg border transition-colors duration-150 ${
                              conversationId === c.id
                                ? "bg-[#2d3548] border-[#4040f2] text-[#c7cdff] shadow-sm"
                                : "bg-[#20242b] border-[#2e323a] text-[#a6a6a6] hover:bg-[#252932] hover:border-[#4040f2]"
                            }`}
                            data-conversation-id={c.id}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void selectConversation(c.id);
                                  if (isMobile) {
                                    setShowConversationsSidebar(false);
                                  }
                                }}
                                className="flex-1 text-left min-w-0 cursor-pointer"
                                title={
                                  c.preview ||
                                  new Date(c.startedAt).toLocaleString()
                                }
                                aria-label={`${c.preview || "Conversation"} from ${formatConversationDate(c.startedAt)}`}
                              >
                                <div className="text-base font-medium truncate w-full">
                                  {c.preview || `Conversation #${c.id}`}
                                </div>
                                <div className="text-[10px] text-[#808080]">
                                  {formatConversationDate(c.startedAt)}
                                </div>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteTriggerRef.current = e.currentTarget;
                                  setDeleteConfirm({
                                    open: true,
                                    conversationId: c.id,
                                  });
                                }}
                                className={`flex items-center justify-center w-6 h-6 rounded transition-colors duration-150 cursor-pointer touch-manipulation ${
                                  conversationId === c.id
                                    ? "text-[#c7cdff] hover:bg-red-600/20 hover:text-red-400"
                                    : "text-[#808080] hover:bg-red-600/20 hover:text-red-400"
                                }`}
                                aria-label="Delete conversation"
                                title="Delete conversation"
                              >
                                <Trash2
                                  className="w-4 h-4"
                                  aria-hidden="true"
                                />
                              </button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {older.length > 0 && (
                      <>
                        <div className="text-[10px] uppercase tracking-wide text-[#8a8f99] px-3 py-1.5 mt-2">
                          Older ({older.length})
                        </div>
                        {older.map((c) => (
                          <div
                            key={c.id}
                            className={`group relative w-full px-3 py-2 rounded-lg border transition-colors duration-150 ${
                              conversationId === c.id
                                ? "bg-[#2d3548] border-[#4040f2] text-[#c7cdff] shadow-sm"
                                : "bg-[#20242b] border-[#2e323a] text-[#a6a6a6] hover:bg-[#252932] hover:border-[#4040f2]"
                            }`}
                            data-conversation-id={c.id}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void selectConversation(c.id);
                                  if (isMobile) {
                                    setShowConversationsSidebar(false);
                                  }
                                }}
                                className="flex-1 text-left min-w-0 cursor-pointer"
                                title={
                                  c.preview ||
                                  new Date(c.startedAt).toLocaleString()
                                }
                                aria-label={`${c.preview || "Conversation"} from ${formatConversationDate(c.startedAt)}`}
                              >
                                <div className="text-base font-medium truncate w-full">
                                  {c.preview || `Conversation #${c.id}`}
                                </div>
                                <div className="text-[10px] text-[#808080]">
                                  {formatConversationDate(c.startedAt)}
                                </div>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteTriggerRef.current = e.currentTarget;
                                  setDeleteConfirm({
                                    open: true,
                                    conversationId: c.id,
                                  });
                                }}
                                className={`flex items-center justify-center w-6 h-6 rounded transition-colors duration-150 cursor-pointer touch-manipulation ${
                                  conversationId === c.id
                                    ? "text-[#c7cdff] hover:bg-red-600/20 hover:text-red-400"
                                    : "text-[#808080] hover:bg-red-600/20 hover:text-red-400"
                                }`}
                                aria-label="Delete conversation"
                                title="Delete conversation"
                              >
                                <Trash2
                                  className="w-4 h-4"
                                  aria-hidden="true"
                                />
                              </button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                );
              })()
            )}
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

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {deleteConfirm.open && deleteConfirm.conversationId !== null && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/50 z-50"
                onClick={() =>
                  !deleting &&
                  setDeleteConfirm({ open: false, conversationId: null })
                }
                aria-hidden="true"
              />
              {/* Modal */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-dialog-title"
                aria-describedby="delete-dialog-description"
              >
                <div
                  ref={deleteModalRef}
                  className="bg-[#1b1f26] border border-[#2e323a] rounded-xl p-6 max-w-sm w-full shadow-xl pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h2
                    id="delete-dialog-title"
                    className="text-lg font-semibold text-white mb-2"
                  >
                    Delete conversation?
                  </h2>
                  <p
                    id="delete-dialog-description"
                    className="text-sm text-[#a6a6a6] mb-6"
                  >
                    This will permanently delete this conversation.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      ref={cancelButtonRef}
                      onClick={() =>
                        !deleting &&
                        setDeleteConfirm({ open: false, conversationId: null })
                      }
                      disabled={deleting}
                      className="px-4 py-2 rounded-lg border border-[#2e323a] text-[#a6a6a6] hover:bg-[#252932] hover:border-[#404040] transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1b1f26]"
                      aria-label="Cancel deletion"
                    >
                      Cancel
                    </button>
                    <button
                      ref={deleteButtonRef}
                      onClick={() => {
                        if (
                          deleteConfirm.conversationId !== null &&
                          !deleting
                        ) {
                          void handleDeleteConversation(
                            deleteConfirm.conversationId
                          );
                        }
                      }}
                      disabled={deleting}
                      className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1b1f26] flex items-center gap-2 min-h-[44px]"
                      aria-label="Confirm deletion"
                    >
                      {deleting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Deleting...</span>
                        </>
                      ) : (
                        "Delete"
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Conversations Toggle Button */}
        {isMobile && (
          <button
            onClick={toggleConversationsSidebar}
            className={`fixed z-30 p-3 rounded-lg transition-all duration-200 cursor-pointer md:hidden ${
              showConversationsSidebar
                ? "top-21 left-4 bg-[#4040f2] hover:bg-[#3636d9] shadow-lg"
                : "top-21 left-4 bg-[#1b1f26] border border-[#2a2e36] hover:bg-[#232838] hover:border-[#4040f2]"
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
                  {recording ? "Start speaking • Tap when done" : ""}
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
              className="flex-1 min-w-0 bg-[#1a1d23] border border-[#2e323a] rounded-lg px-3 py-2 text-white outline-none h-11"
            />
            <button
              onClick={sendText}
              className="px-4 py-2 rounded-lg bg-[#4040f2] text-white text-sm hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer shrink-0 h-11"
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
                className="hidden sm:block bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
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

            {/* Mobile top sheet popup for notes modal */}
            <AnimatePresence>
              {notesPopup.open && (
                <motion.div
                  ref={notesMobilePopupRef}
                  initial={{ y: "-100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "-100%" }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                    duration: 0.3,
                  }}
                  className="sm:hidden fixed inset-x-0 top-0 z-40 bg-[#1a1d23]/95 backdrop-blur border-b border-[#2e323a] p-4"
                >
                  <div className="max-w-sm mx-auto">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="font-bold text-white text-lg truncate">
                        {notesPopup.word}
                      </div>
                    </div>
                    {notesPopup.pinyin ? (
                      <div className="text-[#c6ceff] text-sm font-medium truncate mb-2">
                        {notesPopup.pinyin}
                      </div>
                    ) : null}
                    {Array.isArray(notesPopup.definitions) &&
                    notesPopup.definitions.length > 0 ? (
                      <div className="text-xs text-[#a6a6a6] mb-3 space-y-1">
                        {notesPopup.definitions.map((d, i) => (
                          <div key={i}>• {d}</div>
                        ))}
                      </div>
                    ) : notesPopup.definition ? (
                      <div className="text-xs text-[#a6a6a6] mb-3">
                        {notesPopup.definition}
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setNotesPopup((p) => ({ ...p, open: false }));
                        }}
                        className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] text-[#a6a6a6] cursor-pointer text-sm"
                      >
                        Close
                      </button>
                      <button
                        onClick={async () => {
                          await addSingleToFlashcards(
                            notesPopup.word,
                            notesPopup.ctx
                          );
                          setNotesPopup((p) => ({ ...p, open: false }));
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer"
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
        </div>
      ) : null}
    </DashboardLayout>
  );
}
