"use client";

import { useCallback } from "react";
import {
  useLessonsGenerationStore,
  type ProgressKey,
} from "@/lib/stores/lessons-generation-store";

type StartParams = {
  level: number | null;
  topic?: string;
  readTimeMinutes: number;
  type: "story" | "dialogue";
  timeframe?: "modern" | "mythic" | "imperial" | "pre_modern" | "futuristic";
};

export function useLessonGenerationStream() {
  const genStore = useLessonsGenerationStore();

  const start = useCallback(
    (params: StartParams) => {
      genStore.start(params);
    },
    [genStore]
  );

  const attach = useCallback(
    async (opts: {
      params: StartParams;
      onComplete: (payload: {
        id?: number;
        type: "story" | "dialogue";
        topic?: string | null;
        title?: string | null;
        timeframe?: string | null;
      }) => Promise<void> | void;
      onError: (err?: unknown) => void;
      markAllComplete: () => void;
    }) => {
      const { params, onComplete, onError, markAllComplete } = opts;
      // Use same-origin API so httpOnly cookies are sent with EventSource
      const base = "/api";
      const qs = new URLSearchParams({
        type: params.type,
        readTimeMinutes: String(params.readTimeMinutes),
      });
      if (params.level) qs.set("level", String(params.level));
      if (params.topic) qs.set("topic", params.topic);
      if (params.timeframe) qs.set("timeframe", params.timeframe);
      const url = `${base}/lessons/generate/stream?${qs.toString()}`;

      const storyStepsOrder = [
        "openai_generate_story",
        "segment_story",
        "openai_generate_grammar_notes",
        "segment_grammar_notes_and_tips",
        "persist_lesson",
      ];
      const dialogueStepsOrder = [
        "openai_generate_dialogue",
        "segment_dialogue",
        "rag_retrieve_context",
        "openai_generate_grammar_notes",
        "segment_grammar_notes_and_tips",
        "persist_lesson",
      ];
      const steps =
        params.type === "story" ? storyStepsOrder : dialogueStepsOrder;

      const es = new EventSource(url);
      genStore.setAttached(true);
      let streamFinished = false;
      const markComplete = (key: string) => genStore.markCompleted(key);

      const parsePayload = (raw: unknown): Record<string, unknown> | null => {
        if (raw == null) return null;
        if (typeof raw === "string") {
          if (!raw.trim()) return null;
          try {
            return JSON.parse(raw) as Record<string, unknown>;
          } catch {
            return null;
          }
        }
        if (typeof raw === "object") {
          return raw as Record<string, unknown>;
        }
        return null;
      };

      const handleStepPayload = (raw: unknown) => {
        let payload: unknown = null;
        try {
          payload = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {}
        const key =
          ((payload as { key?: string } | null)?.key as string | undefined) ||
          ((payload as { data?: { key?: string } } | null)?.data?.key as
            | string
            | undefined);
        if (!key) return;
        genStore.setStep(key as ProgressKey);
        const idx = steps.indexOf(key);
        if (idx > 0) {
          for (let i = 0; i < idx; i++) markComplete(steps[i]);
        }
      };

      es.onmessage = (e) => {
        const raw = (e as MessageEvent).data as unknown;
        handleStepPayload(raw);
      };

      es.addEventListener("queued", () => genStore.setStep("queued"));
      es.addEventListener("started", () => genStore.setStep("started"));
      es.addEventListener("step", (e: MessageEvent) =>
        handleStepPayload(e.data)
      );
      es.addEventListener("heartbeat", () => {});
      const handleCompleteEvent = async (raw: unknown) => {
        if (streamFinished) return;
        try {
          const data = parsePayload(raw);
          const id =
            data && typeof data.id === "number"
              ? (data.id as number)
              : undefined;
          const resolvedType =
            data && (data.type === "story" || data.type === "dialogue")
              ? (data.type as "story" | "dialogue")
              : params.type;
          const resolvedTopic =
            data && typeof data.topic === "string"
              ? (data.topic as string)
              : (params.topic ?? null);
          const resolvedTitle =
            data && typeof data.title === "string"
              ? (data.title as string)
              : null;
          const resolvedTimeframe =
            data && typeof data.timeframe === "string"
              ? (data.timeframe as string)
              : (params.timeframe ?? null);

          if (typeof id === "number") {
            steps.forEach((k) => markComplete(k));
            genStore.setStep("complete");
            streamFinished = true;
            es.close();
            await onComplete({
              id,
              type: resolvedType,
              topic: resolvedTopic,
              title: resolvedTitle,
              timeframe: resolvedTimeframe,
            });
          }
        } catch {
          streamFinished = true;
          try {
            es.close();
          } catch {}
          markAllComplete();
        }
      };

      es.addEventListener("complete", async (e: MessageEvent) => {
        await handleCompleteEvent(e.data);
      });
      es.addEventListener("error", () => {
        if (streamFinished) return;
        try {
          es.close();
        } catch {}
        onError();
      });
    },
    [genStore]
  );

  return { start, attach };
}
