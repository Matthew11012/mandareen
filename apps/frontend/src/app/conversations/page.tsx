"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
import { MessageCircle, ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { ConversationList } from "@/components/conversations/ConversationList";
import type { EnrichedConversation } from "@/components/conversations/ConversationList";
import { MessageView } from "@/components/conversations/MessageView";
import { MessageInput } from "@/components/conversations/MessageInput";
import { NotesModal } from "@/components/conversations/NotesModal";

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
  const [loadingPreviews, setLoadingPreviews] = useState<boolean>(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    conversationId: number | null;
  }>({ open: false, conversationId: null });
  const [deleting, setDeleting] = useState<boolean>(false);
  const deleteModalRef = useRef<HTMLDivElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);

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
        // Upload audio and get user message (with transcribed hanzi)
        // Store the user message ID to match with stream updates
        const { user } = await conversationsApi.sendAudio(conversationId, blob);
        // Add user message to state with loading flags for translation and segments
        const userMessageWithLoading: Message = {
          ...user,
          _loadingPinyin: true,
          _loadingTranslation: true,
        };
        setMessages((prev) => [...prev, userMessageWithLoading]);

        // Create stream callbacks that know about the user message ID
        const aiMsgId = Date.now() + 1;
        const userId = user.id;
        const callbacks = createStreamCallbacks(aiMsgId);

        // Wrap onUserUpdate to ensure it matches the correct user message ID
        // The stream should send user-update events with the user message ID from sendAudio
        const originalOnUserUpdate = callbacks.onUserUpdate;
        const originalOnFinal = callbacks.onFinal;
        callbacks.onUserUpdate = (update) => {
          // Apply update if ID matches our user message
          // The original handler already handles the update logic correctly
          if (update.id === userId) {
            originalOnUserUpdate?.(update);
          } else {
            // Fallback: if ID doesn't match, try to update the most recent user message
            // This handles edge cases where server might return a different ID
            setMessages((prev) => {
              // Find the most recent user message that matches our userId
              const userMsgIndex = prev.findIndex(
                (m) => m.role === "user" && m.id === userId
              );
              if (userMsgIndex !== -1) {
                const updated = [...prev];
                const userMsg = updated[userMsgIndex];
                updated[userMsgIndex] = {
                  ...userMsg,
                  pinyin:
                    typeof update.pinyin === "string"
                      ? update.pinyin
                      : userMsg.pinyin,
                  translation:
                    typeof update.translation === "string"
                      ? update.translation
                      : userMsg.translation,
                  segments: Array.isArray(update.segments)
                    ? update.segments
                    : userMsg.segments,
                  _loadingPinyin: false,
                  _loadingTranslation: false,
                };
                return updated;
              }
              // If we can't find the user message, call original handler as fallback
              originalOnUserUpdate?.(update);
              return prev;
            });
          }
        };
        // Safety: if backend doesn't emit user-update during audio flow,
        // hydrate the user message after final by refetching from server.
        callbacks.onFinal = async (...args) => {
          try {
            await originalOnFinal?.(...args);
          } finally {
            try {
              const list = await conversationsApi.listMessages(conversationId);
              const latestUser = list
                .slice()
                .reverse()
                .find((m) => m.role === "user" && m.id === userId);
              if (latestUser) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.role === "user" && m.id === userId
                      ? {
                          ...m,
                          pinyin: latestUser.pinyin ?? m.pinyin,
                          translation: latestUser.translation ?? m.translation,
                          segments: Array.isArray(latestUser.segments)
                            ? latestUser.segments
                            : m.segments,
                          _loadingPinyin: false,
                          _loadingTranslation: false,
                        }
                      : m
                  )
                );
              } else {
                // Even if not found, stop loading to avoid stuck UI
                setMessages((prev) =>
                  prev.map((m) =>
                    m.role === "user" && m.id === userId
                      ? {
                          ...m,
                          _loadingPinyin: false,
                          _loadingTranslation: false,
                        }
                      : m
                  )
                );
              }
            } catch {
              // Ensure loading flags are cleared to prevent spinner lock
              setMessages((prev) =>
                prev.map((m) =>
                  m.role === "user" && m.id === userId
                    ? {
                        ...m,
                        _loadingPinyin: false,
                        _loadingTranslation: false,
                      }
                    : m
                )
              );
            }
          }
        };

        // Start streaming - skip sendAudio since we already called it
        // The user message is already in state, so stream updates will enhance it
        await streamAudio(
          {
            conversationId,
            audio: blob,
            text: user.hanzi,
            skipSendAudio: true,
          },
          callbacks
        );
      } catch {
        toast.error("Failed to send audio");
      }
    },
  });

  // Memoized date formatter utility

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

  // Audio toggle handler
  const handleToggleAudio = useCallback(
    (messageId: number, audioElement: HTMLAudioElement | null) => {
      if (!audioElement) return;
      if (audioElement.paused) {
        void audioElement.play();
        setPlaying((s) => ({ ...s, [messageId]: true }));
        audioElement.onended = () =>
          setPlaying((s) => ({ ...s, [messageId]: false }));
      } else {
        audioElement.pause();
        setPlaying((s) => ({ ...s, [messageId]: false }));
      }
    },
    []
  );

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

  const handleDeleteConversation = async (
    id: number,
    triggerElement?: HTMLElement
  ) => {
    if (deleting) return;

    // Store trigger element for focus restoration
    if (triggerElement) {
      deleteTriggerRef.current = triggerElement;
    }

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

  return (
    <DashboardLayout
      title="Conversations"
      subtitle="Practice natural dialogues"
    >
      <div className="p-2 sm:p-4 h-full flex gap-4 relative">
        {/* Mobile Overlay */}
        {isMobile && showConversationsSidebar && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={toggleConversationsSidebar}
          />
        )}

        {/* Sidebar */}
        <ConversationList
          conversations={conversations}
          activeConversationId={conversationId}
          onSelectConversation={selectConversation}
          onDeleteConversation={(id, triggerElement) => {
            deleteTriggerRef.current = triggerElement;
            setDeleteConfirm({
              open: true,
              conversationId: id,
            });
          }}
          onNewConversation={newConversation}
          isMobile={isMobile}
          showSidebar={showConversationsSidebar}
          onCloseSidebar={() => setShowConversationsSidebar(false)}
          loadingPreviews={loadingPreviews}
        />

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
                ? "sm:top-22 left-2 sm:left-4 bg-[#4040f2] hover:bg-[#3636d9] shadow-lg"
                : "sm:top-22 left-2 sm:left-4 bg-[#1b1f26] border border-[#2a2e36] hover:bg-[#232838] hover:border-[#4040f2]"
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
          className={`flex-1 h-full flex flex-col gap-2 transition-all duration-300 ease-in-out ${
            isMobile && showConversationsSidebar ? "hidden" : ""
          }`}
        >
          <MessageView
            messages={messages}
            aiShowPinyin={aiShowPinyin}
            aiShowTrans={aiShowTrans}
            aiShowNotes={aiShowNotes}
            playing={playing}
            onTogglePinyin={(messageId) =>
              setAiShowPinyin((s) => ({ ...s, [messageId]: !s[messageId] }))
            }
            onToggleTranslation={(messageId) =>
              setAiShowTrans((s) => ({ ...s, [messageId]: !s[messageId] }))
            }
            onToggleNotes={(messageId) =>
              setAiShowNotes((s) => ({ ...s, [messageId]: !s[messageId] }))
            }
            onToggleAudio={handleToggleAudio}
            onOpenNotesModal={openNotesModal}
            resolveMediaUrl={resolveMediaUrl}
          />

          <MessageInput
            input={input}
            onInputChange={setInput}
            onSend={sendText}
            recording={recording}
            recPrompt={recPrompt}
            uploadingAudio={uploadingAudio}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
          />
        </div>
      </div>
      <NotesModal
        open={notesModal.open}
        message={notesModal.message}
        onClose={closeNotesModal}
        notesPinyinOn={notesPinyinOn}
        onTogglePinyin={() => setNotesPinyinOn((v) => !v)}
      />
    </DashboardLayout>
  );
}
