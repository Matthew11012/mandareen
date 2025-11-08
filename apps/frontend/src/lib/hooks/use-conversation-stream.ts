"use client";

import { useCallback, useRef } from "react";
import type { Message } from "@/lib/api/conversations";
import { conversationsApi } from "@/lib/api/conversations";

type Segment = NonNullable<Message["segments"]>[number];

type NotesPayload = {
  grammarNotes?: NonNullable<Message["notes"]>["grammarNotes"];
  tipsRich?:
    | NonNullable<Message["notes"]>["tips"]
    | NonNullable<Message["notes"]>["tipsRich"];
};

type UserUpdatePayload = {
  id: number;
  pinyin?: string;
  translation?: string;
  segments?: Segment[];
};

type FinalPayload = {
  hanzi?: string;
  pinyin?: string;
  translation?: string;
  audioUrl?: string;
  segments?: Segment[];
  notes?: NotesPayload;
};

type StreamCallbacks = {
  onStart?: (ai: { id: number; createdAt: string }) => void;
  onHanziDelta?: (delta: string) => void;
  onAiEnrichment?: (pinyin?: string, segments?: Segment[]) => void;
  onAiTranslation?: (translation?: string) => void;
  onAiAudio?: (audioUrl?: string) => void;
  onAiNotes?: (notes?: NotesPayload) => void;
  onUserUpdate?: (update: UserUpdatePayload) => void;
  onFinal?: (final: FinalPayload) => void;
  onClose?: () => void;
  onError?: (err?: unknown) => void;
};

export function useConversationStream() {
  const currentEsRef = useRef<EventSource | null>(null);

  const closeCurrent = useCallback(() => {
    try {
      currentEsRef.current?.close();
    } finally {
      currentEsRef.current = null;
    }
  }, []);

  const wireHandlers = useCallback((es: EventSource, cb: StreamCallbacks) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try {
        cb.onClose?.();
      } finally {
        try {
          es.close();
        } catch {}
      }
    };
    const isRecord = (v: unknown): v is Record<string, unknown> =>
      typeof v === "object" && v !== null;

    const handleAny = (raw: unknown) => {
      let payload: unknown = raw;
      try {
        if (typeof raw === "string") payload = JSON.parse(raw);
      } catch {
        // ignore
      }

      // Default channel progressive messages
      if (isRecord(payload) && typeof payload.hanziDelta === "string") {
        cb.onHanziDelta?.(payload.hanziDelta);
        return;
      }
      if (isRecord(payload) && payload.type === "ai-enrichment") {
        cb.onAiEnrichment?.(
          payload.pinyin as string | undefined,
          payload.segments as Segment[] | undefined
        );
        return;
      }
      if (isRecord(payload) && payload.type === "ai-translation") {
        cb.onAiTranslation?.(payload.translation as string | undefined);
        return;
      }
      if (isRecord(payload) && payload.type === "ai-audio") {
        cb.onAiAudio?.(payload.audioUrl as string | undefined);
        return;
      }
      if (isRecord(payload) && payload.type === "ai-notes") {
        let notes: NotesPayload | undefined = undefined;
        const notesRaw = (payload as Record<string, unknown>)["notes"];
        if (isRecord(notesRaw)) {
          const grammarNotes = (notesRaw["grammarNotes"] ??
            notesRaw[
              "grammar_notes"
            ]) as unknown as NotesPayload["grammarNotes"];
          const tipsRich = (notesRaw["tipsRich"] ??
            notesRaw["tips_rich"]) as unknown as NotesPayload["tipsRich"];
          notes = { grammarNotes, tipsRich };
        }
        cb.onAiNotes?.(notes);
        return;
      }
      if (
        isRecord(payload) &&
        typeof (payload.id as unknown) !== "undefined" &&
        (typeof payload.translation !== "undefined" ||
          typeof payload.segments !== "undefined")
      ) {
        // Some servers emit a plain user-update on the default channel
        cb.onUserUpdate?.({
          id: Number(payload.id as number),
          pinyin:
            typeof payload.pinyin === "string"
              ? (payload.pinyin as string)
              : undefined,
          translation:
            typeof payload.translation === "string"
              ? (payload.translation as string)
              : undefined,
          segments: Array.isArray(payload.segments)
            ? (payload.segments as Segment[])
            : undefined,
        });
        return;
      }
      if (isRecord(payload) && payload.type === "user-update" && payload.data) {
        try {
          const data = JSON.parse(payload.data as string);
          cb.onUserUpdate?.({
            id: Number(data.id),
            pinyin: typeof data.pinyin === "string" ? data.pinyin : undefined,
            translation:
              typeof data.translation === "string"
                ? data.translation
                : undefined,
            segments: Array.isArray(data.segments)
              ? (data.segments as Segment[])
              : undefined,
          });
        } catch {
          // ignore
        }
        return;
      }
      if (isRecord(payload) && payload.type === "final") {
        // Some servers send a named/default "final" with JSON string in data,
        // others send an object without a nested data field.
        if (payload.data) {
          try {
            const data = JSON.parse(payload.data as string);
            const notes: NotesPayload | undefined = data?.notes
              ? {
                  grammarNotes:
                    data.notes.grammarNotes ??
                    data.notes.grammar_notes ??
                    undefined,
                  tipsRich:
                    data.notes.tipsRich ?? data.notes.tips_rich ?? undefined,
                }
              : undefined;
            cb.onFinal?.({
              hanzi: data.hanzi,
              pinyin: data.pinyin,
              translation: data.translation,
              audioUrl: data.audioUrl,
              segments: Array.isArray(data.segments)
                ? (data.segments as Segment[])
                : undefined,
              notes,
            });
          } catch {
            // ignore
          }
        } else {
          // Final marker without payload: just finish
          cb.onFinal?.({});
        }
        finish();
        return;
      }
    };

    es.onmessage = (e: MessageEvent) => handleAny(e.data);
    // Be tolerant: also listen for named events if server uses them
    [
      "hanziDelta",
      "ai-enrichment",
      "ai-translation",
      "ai-audio",
      "ai-notes",
      "user-update",
      "final",
    ].forEach((evt) =>
      es.addEventListener(evt, (e: MessageEvent) => handleAny(e.data))
    );
    // Some servers emit a terminal "complete" event without data
    es.addEventListener("complete", () => finish());

    es.onerror = () => {
      // Normal closures also fire error in some environments; if already finished, do nothing
      if (!finished) cb.onError?.();
    };
  }, []);

  const streamText = useCallback(
    async (
      params: {
        conversationId: number;
        text: string;
      },
      cb: StreamCallbacks
    ) => {
      closeCurrent();
      // Optimistic start for AI message identity
      const aiId = Date.now() + 1;
      const createdAt = new Date().toISOString();
      cb.onStart?.({ id: aiId, createdAt });

      const url = conversationsApi.streamUrl(
        params.conversationId,
        params.text
      );
      const es = new EventSource(url, { withCredentials: true });
      currentEsRef.current = es;
      wireHandlers(es, cb);
    },
    [closeCurrent, wireHandlers]
  );

  const streamAudio = useCallback(
    async (
      params: {
        conversationId: number;
        audio: Blob;
        text?: string; // Optional: pass transcribed hanzi to enable user-update events
        skipSendAudio?: boolean; // If true, skip sendAudio call (already done by caller)
      },
      cb: StreamCallbacks
    ) => {
      closeCurrent();
      const aiId = Date.now() + 1;
      const createdAt = new Date().toISOString();
      cb.onStart?.({ id: aiId, createdAt });

      // Only upload audio if not already done by caller
      // This prevents duplicate user messages when sendAudio is called in onData callback
      if (!params.skipSendAudio) {
        await conversationsApi.sendAudio(params.conversationId, params.audio);
      }
      // If text is provided, include it so servers that emit "user-update"
      // for text flows will do the same for audio flows.
      const url = conversationsApi.streamUrl(
        params.conversationId,
        params.text ?? ""
      );
      const es = new EventSource(url, { withCredentials: true });
      currentEsRef.current = es;
      wireHandlers(es, cb);
    },
    [closeCurrent, wireHandlers]
  );

  const cancel = useCallback(() => {
    closeCurrent();
  }, [closeCurrent]);

  return { streamText, streamAudio, cancel };
}
