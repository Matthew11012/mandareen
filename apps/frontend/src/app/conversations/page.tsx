"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  useId,
} from "react";
import { DashboardLayout } from "@/components/layout";
import {
  conversationsApi,
  type Message,
  type ConversationSummary,
  type ConversationHskLevel,
} from "@/lib/api/conversations";
import { assessmentApi } from "@/lib/api/assessment";
import { useConversationStream } from "@/lib/hooks/use-conversation-stream";
import { useAudioRecorder } from "@/lib/hooks/use-audio-recorder";
import {
  useConversationsList,
  useMessages,
  useStartConversation,
  useDeleteConversation,
  useSendAudio,
  useUpdateMessagesCache,
  sortConversationsByStartedAt,
} from "@/lib/hooks/use-conversations";
import { buildFallbackSegments } from "@/lib/utils/segments";
import { MessageCircle, ChevronLeft, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { ConversationList } from "@/components/conversations/ConversationList";
import type { EnrichedConversation } from "@/components/conversations/ConversationList";
import { MessageView } from "@/components/conversations/MessageView";
import { MessageInput } from "@/components/conversations/MessageInput";
import { NotesModal } from "@/components/conversations/NotesModal";
import { DeleteConfirmationModal } from "@/components/conversations/DeleteConfirmationModal";
import { useUsageSummary } from "@/lib/hooks/use-usage";
import {
  ConversationUsageHeader,
  CONVERSATION_USAGE_RESOURCES,
} from "@/components/conversations/ConversationUsageHeader";
import {
  ConversationErrorBanner,
  type ConversationErrorState,
} from "@/components/conversations/ConversationErrorBanner";
import { ConversationUsageToast } from "@/components/conversations/ConversationUsageToast";
import { shouldDisplayResource } from "@/lib/constants/usage-resources";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const INT32_MAX = 2147483647;
const isPersistedMessageId = (id: number | null | undefined) =>
  typeof id === "number" && Number.isFinite(id) && Math.abs(id) <= INT32_MAX;
const HSK_SELECTION_STORAGE_KEY = "conversation-hsk-level";
const HSK_LEVEL_OPTIONS: Array<{
  value: ConversationHskLevel;
  label: string;
  shortLabel: string;
  helper: string;
}> = [
  {
    value: "hsk1",
    label: "HSK 1 • Beginner",
    shortLabel: "HSK 1",
    helper: "Short SVO phrases only",
  },
  {
    value: "hsk2",
    label: "HSK 2 • Elementary",
    shortLabel: "HSK 2",
    helper: "Simple compound sentences",
  },
  {
    value: "hsk3",
    label: "HSK 3 • Intermediate",
    shortLabel: "HSK 3",
    helper: "Adds basic subordinate clauses",
  },
  {
    value: "hsk4",
    label: "HSK 4 • Upper intermediate",
    shortLabel: "HSK 4",
    helper: "Multi-clause sentences, light idioms",
  },
  {
    value: "hsk5",
    label: "HSK 5 • Advanced ",
    shortLabel: "HSK 5",
    helper: "Fluent phrasing with richer structures",
  },
  {
    value: "hsk6",
    label: "HSK 6 • Proficient",
    shortLabel: "HSK 6",
    helper: "Near-native nuance",
  },
  {
    value: "hsk7_9",
    label: "HSK 7–9 • Expert",
    shortLabel: "HSK 7–9",
    helper: "Academic or research-grade register",
  },
];

const mapCurrentLevelToSelection = (
  level: number | null
): ConversationHskLevel | null => {
  if (typeof level !== "number" || !Number.isFinite(level) || level < 1) {
    return null;
  }
  if (level >= 7) return "hsk7_9";
  const clamped = Math.min(Math.max(Math.round(level), 1), 6);
  return `hsk${clamped}` as ConversationHskLevel;
};

const isValidHskSelection = (
  value: string | null
): value is ConversationHskLevel =>
  !!value && HSK_LEVEL_OPTIONS.some((option) => option.value === value);

export default function ConversationsPage() {
  const [conversationId, setConversationId] = useState<number | null>(null);
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
  const [targetHskLevel, setTargetHskLevel] =
    useState<ConversationHskLevel | null>(null);
  const [hydratingHskLevel, setHydratingHskLevel] = useState<boolean>(false);
  const hskSelectId = useId();
  const hskSelectLabelId = useId();
  const hskSelectDescriptionId = useId();
  const selectedHskOption = useMemo(
    () =>
      targetHskLevel
        ? (HSK_LEVEL_OPTIONS.find(
            (option) => option.value === targetHskLevel
          ) ?? null)
        : null,
    [targetHskLevel]
  );

  const persistHskSelection = useCallback((value: ConversationHskLevel) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(HSK_SELECTION_STORAGE_KEY, value);
    } catch {
      // Ignore storage failures (e.g., private mode)
    }
  }, []);

  const handleHskSelectionChange = useCallback(
    (value: ConversationHskLevel) => {
      setTargetHskLevel(value);
      persistHskSelection(value);
    },
    [persistHskSelection]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(HSK_SELECTION_STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (isValidHskSelection(stored)) {
      setTargetHskLevel(stored);
      return;
    }
    let cancelled = false;
    setHydratingHskLevel(true);
    assessmentApi
      .getCurrentLevel()
      .then(({ currentLevel }) => {
        if (cancelled) return;
        const mapped = mapCurrentLevelToSelection(currentLevel);
        if (mapped) {
          setTargetHskLevel(mapped);
          persistHskSelection(mapped);
        }
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Failed to load default HSK level", err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHydratingHskLevel(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [persistHskSelection]);

  // Handler to generate notes for a message
  const handleGenerateNotes = async (messageId: number) => {
    if (!conversationId) return;
    const targetMessage = messages.find(
      (m) => m.id === messageId && m.role === "ai"
    ) as (Message & { _persisted?: boolean }) | undefined;
    const messagePersisted =
      targetMessage?._persisted ||
      (typeof messageId === "number" && isPersistedMessageId(messageId));
    if (!messagePersisted) {
      toast.info("Notes will be available once this reply finishes saving.");
      return;
    }
    try {
      const res = await conversationsApi.generateManualNotes(
        conversationId,
        messageId
      );
      // Update the message in cache with generated notes
      updateMessagesCache(conversationId, (prev) =>
        prev.map((m) =>
          m.id === messageId && m.role === "ai"
            ? {
                ...m,
                notes: res.notes,
              }
            : m
        )
      );
      toast.success("Notes generated. Open Notes to review them.");
    } catch (err: unknown) {
      // Extract error message for user feedback
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to generate notes. Please try again.";

      // Check if it's a quota error
      const status =
        typeof err === "object" && err !== null
          ? ((err as { status?: number; response?: { status?: number } })
              .status ??
            (err as { status?: number; response?: { status?: number } })
              .response?.status)
          : undefined;
      if (status === 429 || status === 403) {
        toast.error(
          "You've reached the manual notes generation limit for your plan. Upgrade to generate more notes."
        );
      } else if (
        errorMessage.includes("aborted") ||
        errorMessage.includes("signal") ||
        errorMessage.includes("timeout")
      ) {
        toast.error(
          "Note generation timed out. Please try again. If this persists, the request may be taking too long."
        );
      } else {
        toast.error(errorMessage);
      }
      throw err; // Re-throw so MessageView can handle it
    }
  };
  const [playing, setPlaying] = useState<Record<number, boolean>>({});
  const [loadingPreviews, setLoadingPreviews] = useState<boolean>(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    conversationId: number | null;
  }>({ open: false, conversationId: null });
  const [deleting, setDeleting] = useState<boolean>(false);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const [conversationError, setConversationError] =
    useState<ConversationErrorState | null>(null);
  const errorBannerRef = useRef<HTMLDivElement | null>(null);
  const creatingConversationRef = useRef<boolean>(false);
  const [now, setNow] = useState(Date.now());
  const [dismissedUsageReset, setDismissedUsageReset] = useState<string | null>(
    null
  );
  const autoPlayedAudioRef = useRef<Set<number>>(new Set());
  const [pendingAutoPlayMessageId, setPendingAutoPlayMessageId] = useState<
    number | null
  >(null);
  const previousConversationIdRef = useRef<number | null>(null);
  const {
    data: usageSummary,
    isLoading: usageLoading,
    isFetching: usageFetching,
    refetch: refetchUsageSummary,
  } = useUsageSummary(true);

  const handleRefreshUsage = useCallback(async () => {
    try {
      await refetchUsageSummary();
    } catch (err) {
      console.error("Failed to refresh usage summary", err);
      toast.error("Failed to refresh usage. Please try again.");
    }
  }, [refetchUsageSummary]);

  const extractConversationError = useCallback(
    (error: unknown): ConversationErrorState | null => {
      if (!(error instanceof Error)) return null;
      const payload = (error as { response?: unknown }).response;
      if (!payload || typeof payload !== "object" || payload === null) {
        return null;
      }
      const data = payload as Record<string, unknown>;
      const code = typeof data.code === "string" ? data.code : undefined;
      if (!code) return null;

      switch (code) {
        case "QUOTA_EXCEEDED": {
          const planCap =
            typeof data.planCap === "number"
              ? data.planCap
              : Number(data.planCap ?? NaN);
          const used =
            typeof data.used === "number"
              ? data.used
              : Number(data.used ?? NaN);
          const resource =
            typeof data.resource === "string" ? data.resource : "unknown";
          return {
            kind: "quota",
            message:
              typeof data.message === "string"
                ? data.message
                : error.message ||
                  "You’ve hit your plan limit for conversations.",
            resource,
            planCap: Number.isFinite(planCap) ? planCap : 0,
            used: Number.isFinite(used) ? used : 0,
          };
        }
        case "RATE_LIMITED": {
          const retryAfterRaw =
            typeof data.retryAfter === "number"
              ? data.retryAfter
              : Number(data.retryAfter ?? 0);
          const retryAfter = Number.isFinite(retryAfterRaw)
            ? Math.max(1, Math.round(retryAfterRaw))
            : 5;
          const resource =
            typeof data.resource === "string" ? data.resource : "unknown";
          const retryAt = Date.now() + retryAfter * 1000;
          return {
            kind: "rate",
            message:
              typeof data.message === "string"
                ? data.message
                : error.message || "Rate limit exceeded.",
            resource,
            retrySeconds: retryAfter,
            retryAt,
          };
        }
        case "CONCURRENCY_LIMIT": {
          const limit =
            typeof data.limit === "number"
              ? data.limit
              : Number(data.limit ?? NaN);
          const retryAfterRaw =
            typeof data.retryAfter === "number"
              ? data.retryAfter
              : Number(data.retryAfter ?? NaN);
          const retryAt =
            Number.isFinite(retryAfterRaw) && retryAfterRaw > 0
              ? Date.now() + Math.round(retryAfterRaw) * 1000
              : undefined;
          const resource =
            typeof data.resource === "string" ? data.resource : "unknown";
          return {
            kind: "concurrency",
            message:
              typeof data.message === "string"
                ? data.message
                : error.message || "Too many active conversations.",
            resource,
            limit: Number.isFinite(limit) ? limit : undefined,
            retrySeconds:
              Number.isFinite(retryAfterRaw) && retryAfterRaw > 0
                ? Math.round(retryAfterRaw)
                : undefined,
            retryAt,
          };
        }
        default:
          return null;
      }
    },
    []
  );

  const handleConversationError = useCallback(
    (error: unknown): boolean => {
      const parsed = extractConversationError(error);
      if (parsed) {
        setConversationError(parsed);
        return true;
      }
      return false;
    },
    [extractConversationError]
  );

  useEffect(() => {
    if (!conversationError) return;
    requestAnimationFrame(() => {
      errorBannerRef.current?.focus();
    });
  }, [conversationError]);

  useEffect(() => {
    if (conversationError?.kind !== "rate") return;
    setNow(Date.now());
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [conversationError?.kind]);

  const remainingRateSeconds = useMemo(() => {
    if (conversationError?.kind !== "rate") return 0;
    return Math.max(0, Math.ceil((conversationError.retryAt - now) / 1000));
  }, [conversationError, now]);

  const effectiveError = useMemo(() => {
    if (!conversationError) return null;
    if (conversationError.kind === "rate") {
      return {
        ...conversationError,
        retrySeconds: remainingRateSeconds,
      } satisfies ConversationErrorState;
    }
    return conversationError;
  }, [conversationError, remainingRateSeconds]);

  const conversationUsageAlert = useMemo(() => {
    if (!usageSummary) return null;

    const tracked = CONVERSATION_USAGE_RESOURCES.map((resource) => {
      const usage = usageSummary.resources[resource];
      if (!usage || !shouldDisplayResource(resource, usage.cap)) {
        return null;
      }
      return {
        resource,
        pct: usage.pct,
        resetsAt: usage.resetsAt,
      };
    }).filter(Boolean) as Array<{
      resource: (typeof CONVERSATION_USAGE_RESOURCES)[number];
      pct: number;
      resetsAt: string;
    }>;

    if (tracked.length === 0) return null;

    return tracked.reduce((highest, current) =>
      current.pct > highest.pct ? current : highest
    );
  }, [usageSummary]);

  useEffect(() => {
    if (!conversationUsageAlert) return;
    if (
      dismissedUsageReset &&
      conversationUsageAlert.resetsAt !== dismissedUsageReset
    ) {
      setDismissedUsageReset(null);
    }
  }, [conversationUsageAlert, dismissedUsageReset]);

  const usageToastTarget =
    conversationUsageAlert &&
    conversationUsageAlert.pct >= 90 &&
    conversationUsageAlert.resetsAt !== dismissedUsageReset &&
    effectiveError?.kind !== "quota"
      ? conversationUsageAlert
      : null;

  const dismissUsageToast = useCallback(() => {
    if (!usageToastTarget) return;
    setDismissedUsageReset(usageToastTarget.resetsAt);
  }, [usageToastTarget]);

  const sendDisabled =
    effectiveError?.kind === "quota" ||
    (effectiveError?.kind === "rate" && effectiveError.retrySeconds > 0);

  const sendDisabledReason =
    effectiveError?.kind === "quota"
      ? "You’ve reached the current plan’s conversation limit."
      : effectiveError?.kind === "rate" && effectiveError.retrySeconds > 0
        ? `Try again in ${effectiveError.retrySeconds}s`
        : undefined;

  const audioUsage = usageSummary?.resources?.convo_tts_seconds;
  const audioQuotaExceeded =
    !!audioUsage && audioUsage.cap > 0 && audioUsage.used >= audioUsage.cap;

  const audioDisabled = sendDisabled || audioQuotaExceeded;
  const audioDisabledReason = audioQuotaExceeded
    ? "You’ve used all audio minutes available on your plan."
    : sendDisabledReason;

  const dismissError = useCallback(() => {
    setConversationError(null);
  }, []);

  // Hooks
  const { streamAudio } = useConversationStream();
  const { data: conversationsList, refetch: refetchConversations } =
    useConversationsList();
  const { data: messagesData, refetch: refetchMessages } =
    useMessages(conversationId);
  const startConversationMutation = useStartConversation();
  const deleteConversationMutation = useDeleteConversation();
  const sendAudioMutation = useSendAudio();
  const updateMessagesCache = useUpdateMessagesCache();

  // Use query data directly
  const messages = useMemo(() => messagesData ?? [], [messagesData]);

  // Enriched conversations state (with previews)
  const [enrichedConversations, setEnrichedConversations] = useState<
    EnrichedConversation[]
  >([]);

  // Helper to create stream callbacks for updating messages cache
  type _NotesType = NonNullable<Message["notes"]>;
  type _GrammarNotesType = _NotesType["grammarNotes"];
  type _TipsRichType = _NotesType["tipsRich"];
  const createStreamCallbacks = useCallback(
    (aiMsgId: number) => {
      if (!conversationId) {
        return {
          onStart: () => {},
          onHanziDelta: () => {},
          onAiEnrichment: () => {},
          onAiTranslation: () => {},
          onAiAudio: () => {},
          onAiNotes: () => {},
          onUserUpdate: () => {},
          onFinal: () => {},
          onError: async () => {},
        };
      }
      // Track the target AI message id; start with caller-provided id, but
      // switch to the id provided by onStart to ensure consistency with the stream
      let targetId = aiMsgId;
      return {
        onStart: ({ id, createdAt }: { id: number; createdAt: string }) => {
          targetId = id;
          updateMessagesCache(conversationId, (prev) => [
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
              _persisted: false,
            } as Message,
          ]);
        },
        onHanziDelta: (delta: string) => {
          updateMessagesCache(conversationId, (prev) =>
            prev.map((m) =>
              m.id === targetId ? { ...m, hanzi: (m.hanzi || "") + delta } : m
            )
          );
        },
        onAiEnrichment: (pinyin?: string, segments?: Message["segments"]) => {
          updateMessagesCache(conversationId, (prev) =>
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
          updateMessagesCache(conversationId, (prev) =>
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
          updateMessagesCache(conversationId, (prev) =>
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
          updateMessagesCache(conversationId, (prev) =>
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
          updateMessagesCache(conversationId, (prev) =>
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
          id?: number;
          hanzi?: string;
          pinyin?: string;
          translation?: string;
          audioUrl?: string;
          segments?: Message["segments"];
          notes?: unknown;
        }) => {
          if (typeof final.id === "number" && final.id !== targetId) {
            const persistedId = final.id;
            const oldTargetId = targetId;
            updateMessagesCache(conversationId, (prev) =>
              prev.map((m) =>
                m.id === oldTargetId
                  ? {
                      ...m,
                      id: persistedId,
                      _persisted: true,
                    }
                  : m
              )
            );
            setPendingAutoPlayMessageId((current) =>
              current === oldTargetId ? persistedId : current
            );
            targetId = persistedId;
          } else if (typeof final.id === "number" && final.id === targetId) {
            // If ID is already correct, just mark as persisted
            updateMessagesCache(conversationId, (prev) =>
              prev.map((m) =>
                m.id === targetId ? { ...m, _persisted: true } : m
              )
            );
          }
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
          updateMessagesCache(conversationId, (prev) =>
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
                    _persisted:
                      typeof final.id === "number"
                        ? isPersistedMessageId(final.id)
                        : true,
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
                updateMessagesCache(conversationId, (prev) =>
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
    [conversationId, updateMessagesCache, setPendingAutoPlayMessageId]
  );

  const {
    start: startRecording,
    stop: stopRecording,
    cancel: cancelRecording,
    recording,
    recPrompt,
    uploadingAudio,
    stream: audioStream,
  } = useAudioRecorder({
    onData: async (blob) => {
      if (!conversationId) return;
      try {
        // Upload audio and get user message (with transcribed hanzi)
        // The mutation will add the user message to cache with loading flags
        const { user } = await sendAudioMutation.mutateAsync({
          id: conversationId,
          audio: blob,
        });

        // Create stream callbacks that know about the user message ID
        const aiMsgId = Date.now() + 1;
        const userId = user.id;
        const callbacks = createStreamCallbacks(aiMsgId);

        // Wrap onUserUpdate to ensure it matches the correct user message ID
        // The stream should send user-update events with the user message ID from sendAudio
        const originalOnStart = callbacks.onStart;
        const originalOnUserUpdate = callbacks.onUserUpdate;
        const originalOnFinal = callbacks.onFinal;
        callbacks.onStart = (payload) => {
          originalOnStart?.(payload);
          setPendingAutoPlayMessageId(payload.id);
        };
        callbacks.onUserUpdate = (update) => {
          // Apply update if ID matches our user message
          // The original handler already handles the update logic correctly
          if (update.id === userId) {
            originalOnUserUpdate?.(update);
          } else {
            // Fallback: if ID doesn't match, try to update the most recent user message
            // This handles edge cases where server might return a different ID
            updateMessagesCache(conversationId, (prev) => {
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
                updateMessagesCache(conversationId, (prev) =>
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
                updateMessagesCache(conversationId, (prev) =>
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
              updateMessagesCache(conversationId, (prev) =>
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
        // The user message is already in cache, so stream updates will enhance it
        await streamAudio(
          {
            conversationId,
            audio: blob,
            text: user.hanzi,
            skipSendAudio: true,
            targetHskLevel,
          },
          callbacks
        );
        setConversationError(null);
      } catch (err) {
        if (!handleConversationError(err)) {
          toast.error("Failed to send audio");
        }
      }
    },
  });

  // Memoized date formatter utility

  // Load conversation previews in parallel and update enriched state
  const loadConversationPreviews = useCallback(
    async (convos: ConversationSummary[]): Promise<void> => {
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

      const enriched: EnrichedConversation[] = previews.map((result, idx) =>
        result.status === "fulfilled"
          ? result.value
          : { ...sorted[idx], preview: undefined }
      );

      // Update enriched conversations state
      setEnrichedConversations(enriched);
    },
    []
  );
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

  // Load previews when conversations list changes
  useEffect(() => {
    if (conversationsList) {
      // Initialize enriched conversations with base data (no previews yet)
      setEnrichedConversations(
        conversationsList.map((c) => ({ ...c, preview: undefined }))
      );
      // Load previews in background
      setLoadingPreviews(true);
      loadConversationPreviews(conversationsList)
        .then(() => {
          setLoadingPreviews(false);
        })
        .catch(() => {
          setLoadingPreviews(false);
        });
    }
  }, [conversationsList, loadConversationPreviews]);

  // Initial load: select conversation or create new one
  useEffect(() => {
    if (!conversationsList) return;

    const saved =
      typeof window !== "undefined"
        ? localStorage.getItem("active-conversation-id")
        : null;
    const savedId = saved ? Number(saved) : null;

    if (conversationsList.length > 0) {
      // Reset creation flag when conversations exist
      creatingConversationRef.current = false;

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
      // No conversations, create new one - but only if not already creating
      if (
        creatingConversationRef.current ||
        startConversationMutation.isPending
      ) {
        return;
      }

      creatingConversationRef.current = true;
      startConversationMutation.mutate(undefined, {
        onSuccess: async ({ id }) => {
          setConversationId(id);
          if (typeof window !== "undefined")
            localStorage.setItem("active-conversation-id", String(id));
          await refetchConversations();
          creatingConversationRef.current = false;
        },
        onError: () => {
          toast.error("Failed to start conversation");
          creatingConversationRef.current = false;
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationsList, conversationId]);

  // Audio toggle handler
  const handleToggleAudio = useCallback(
    async (
      messageId: number,
      audioElement: HTMLAudioElement | null,
      _source: "manual" | "auto" = "manual"
    ): Promise<boolean> => {
      void _source;
      if (!audioElement) {
        return false;
      }

      if (audioElement.paused) {
        setPlaying((s) => ({ ...s, [messageId]: true }));
        audioElement.onended = () =>
          setPlaying((s) => ({ ...s, [messageId]: false }));

        try {
          const playPromise = audioElement.play();
          if (playPromise) {
            await playPromise;
          }
          return true;
        } catch (_error) {
          void _error;
          setPlaying((s) => ({ ...s, [messageId]: false }));
          return false;
        }
      }

      audioElement.pause();
      setPlaying((s) => ({ ...s, [messageId]: false }));
      return true;
    },
    []
  );

  // Clear auto-play tracking when switching conversations
  useEffect(() => {
    if (previousConversationIdRef.current === conversationId) return;
    previousConversationIdRef.current = conversationId;
    autoPlayedAudioRef.current.clear();
    if (pendingAutoPlayMessageId !== null) {
      setPendingAutoPlayMessageId(null);
    }
  }, [conversationId, pendingAutoPlayMessageId]);

  // Auto-play newly received AI audio once it's available
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    if (!pendingAutoPlayMessageId) return;

    const nextMessage = messages.find(
      (m) =>
        m.id === pendingAutoPlayMessageId &&
        m.role === "ai" &&
        !!m.audioUrl &&
        !autoPlayedAudioRef.current.has(m.id)
    );

    if (!nextMessage) {
      return;
    }

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    const audioElementId = `audio-${nextMessage.id}`;
    const maxRetries = 20;

    const attemptPlay = (attempt = 0) => {
      if (cancelled) return;
      const audioElement = document.getElementById(
        audioElementId
      ) as HTMLAudioElement | null;

      if (!audioElement) {
        if (attempt < maxRetries) {
          retryTimeout = setTimeout(() => attemptPlay(attempt + 1), 150);
        } else {
          setPendingAutoPlayMessageId(null);
        }
        return;
      }

      if (audioElement.preload === "none") {
        audioElement.preload = "auto";
        try {
          audioElement.load();
        } catch {
          // ignore load errors, play will still attempt to fetch
        }
      }

      void handleToggleAudio(nextMessage.id, audioElement, "auto").then(
        (started) => {
          setPendingAutoPlayMessageId(null);
          if (started) {
            autoPlayedAudioRef.current.add(nextMessage.id);
          }
        }
      );
    };

    attemptPlay();

    return () => {
      cancelled = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [messages, handleToggleAudio, pendingAutoPlayMessageId]);

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
    setConversationError(null);
    setConversationId(id);
    if (typeof window !== "undefined")
      localStorage.setItem("active-conversation-id", String(id));
    // Messages will be loaded via useMessages hook when conversationId changes
    await refetchMessages();
  };

  const newConversation = async () => {
    try {
      const { id } = await startConversationMutation.mutateAsync(undefined);
      setConversationError(null);
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
    const sorted = sortConversationsByStartedAt(conversationsList ?? []);
    const nextId = sorted.find((c) => c.id !== id)?.id ?? null;

    setDeleting(true);
    deleteConversationMutation.mutate(id, {
      onSuccess: async () => {
        // Handle active conversation switching
        if (wasActive) {
          if (nextId) {
            setConversationId(nextId);
            if (typeof window !== "undefined")
              localStorage.setItem("active-conversation-id", String(nextId));
            await refetchMessages();
          } else {
            // No conversations left, create new one
            await newConversation();
          }
        }
        toast.success("Conversation deleted", {
          duration: 3000,
        });
        setDeleteConfirm({ open: false, conversationId: null });
        setDeleting(false);
      },
      onError: () => {
        toast.error("Failed to delete conversation");
        setDeleteConfirm({ open: false, conversationId: null });
        setDeleting(false);
        // Focus the restored item for accessibility after modal closes
        setTimeout(() => {
          const restoredButton = document.querySelector(
            `[data-conversation-id="${id}"] button`
          ) as HTMLButtonElement | null;
          restoredButton?.focus();
        }, 100);
      },
    });
  };

  const toggleConversationsSidebar = () => {
    setShowConversationsSidebar(!showConversationsSidebar);
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
          conversations={enrichedConversations}
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
        <DeleteConfirmationModal
          open={deleteConfirm.open}
          conversationId={deleteConfirm.conversationId}
          deleting={deleting}
          onConfirm={(id) => {
            void handleDeleteConversation(id);
          }}
          onCancel={() => {
            setDeleteConfirm({ open: false, conversationId: null });
          }}
          triggerRef={deleteTriggerRef}
        />

        {/* Conversations Toggle Button */}
        {isMobile && (
          <button
            onClick={toggleConversationsSidebar}
            className={`fixed z-30 p-3 rounded-lg transition-all duration-200 cursor-pointer md:hidden ${
              showConversationsSidebar
                ? "bottom-16 right-2 bg-[#4040f2] hover:bg-[#3636d9] shadow-lg"
                : "bottom-19 right-2 bg-[#1b1f26] border border-[#2a2e36] hover:bg-[#232838] hover:border-[#4040f2]"
            }`}
            style={{ touchAction: "manipulation" }}
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
            <div className="flex items-center gap-2 flex-shrink-0">
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
          className={`relative flex-1 h-full flex flex-col gap-2 transition-all duration-300 ease-in-out ${
            isMobile && showConversationsSidebar ? "hidden" : ""
          }`}
        >
          {usageToastTarget && (
            <div className="pointer-events-none absolute left-0 right-0 bottom-36 z-20 flex justify-center px-4 sm:justify-end sm:px-6">
              <ConversationUsageToast
                className="pointer-events-auto"
                pct={usageToastTarget.pct}
                resetsAt={usageToastTarget.resetsAt}
                onDismiss={dismissUsageToast}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ConversationUsageHeader
              summary={usageSummary}
              isLoading={usageLoading}
              onRefresh={handleRefreshUsage}
              isRefreshing={usageFetching && !usageLoading}
              className="flex-1 flex-shrink-0"
            />
            <div className="flex items-center gap-2">
              <span id={hskSelectLabelId} className="sr-only">
                AI response HSK level
              </span>
              <Tooltip
                content="Tailor every new tutor reply to your preferred level."
                disableTouchDetection
              >
                <button
                  type="button"
                  aria-label="About AI HSK level"
                  className="h-6 w-6 flex items-center justify-center rounded-full border border-[#2e323a] text-[#a6a6a6] hover:text-white hover:border-[#4040f2] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2]"
                >
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </Tooltip>
              <Select
                value={targetHskLevel ?? undefined}
                onValueChange={(value) =>
                  handleHskSelectionChange(value as ConversationHskLevel)
                }
                disabled={hydratingHskLevel}
              >
                <SelectTrigger
                  id={hskSelectId}
                  aria-labelledby={`${hskSelectLabelId}`}
                  aria-describedby={hskSelectDescriptionId}
                  className="w-auto bg-transparent border-[#404040] text-white min-h-[40px] sm:min-h-[42px] px-3 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0c10]"
                  style={{ minWidth: "auto" }}
                  aria-busy={hydratingHskLevel}
                  title="Choose the HSK difficulty band for AI replies"
                >
                  <SelectValue
                    className="text-sm font-medium text-white [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1"
                    placeholder={
                      hydratingHskLevel ? "Loading level…" : "Select HSK level"
                    }
                  >
                    {selectedHskOption ? (
                      <>
                        <span className="md:hidden">
                          {selectedHskOption.shortLabel}
                        </span>
                        <span className="hidden md:inline">
                          {selectedHskOption.label}
                        </span>
                      </>
                    ) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-[#2e323a] border-[#404040]">
                  {HSK_LEVEL_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-white hover:bg-[#404040]"
                    >
                      <div className="flex flex-col text-left">
                        <span className="font-medium">{option.label}</span>
                        <span className="text-[11px] text-[#a6a6a6]">
                          {option.helper}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span id={hskSelectDescriptionId} className="sr-only">
                Tailor every new tutor reply to your preferred difficulty.
              </span>
            </div>
          </div>
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
            onGenerateNotes={handleGenerateNotes}
            conversationId={conversationId}
            resolveMediaUrl={resolveMediaUrl}
          />

          <MessageInput
            recording={recording}
            recPrompt={recPrompt}
            uploadingAudio={uploadingAudio}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onCancelRecording={cancelRecording}
            audioStream={audioStream}
            sendDisabled={sendDisabled}
            sendDisabledReason={sendDisabledReason}
            audioDisabled={audioDisabled}
            audioDisabledReason={audioDisabledReason}
          />
          {effectiveError && (
            <div className="mt-3">
              <ConversationErrorBanner
                ref={errorBannerRef}
                error={effectiveError}
                onDismiss={
                  effectiveError.kind === "rate" ? undefined : dismissError
                }
              />
            </div>
          )}
        </div>
      </div>
      <NotesModal
        open={notesModal.open}
        message={notesModal.message}
        conversationId={conversationId}
        onClose={closeNotesModal}
        notesPinyinOn={notesPinyinOn}
        onTogglePinyin={() => setNotesPinyinOn((v) => !v)}
      />
    </DashboardLayout>
  );
}
