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
        topic?: string;
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

      es.onmessage = async (e) => {
        const raw = (e as MessageEvent).data as unknown;
        handleStepPayload(raw);
        try {
          let id: number | undefined = undefined;
          if (typeof raw === "string" && raw.trim().length > 0) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.id === "number") id = parsed.id;
          } else if (
            raw &&
            typeof raw === "object" &&
            typeof (raw as { id?: unknown }).id === "number"
          ) {
            id = (raw as { id?: unknown }).id as number;
          }
          if (typeof id === "number" && !streamFinished) {
            steps.forEach((k) => markComplete(k));
            genStore.setStep("complete");
            streamFinished = true;
            es.close();
            await onComplete({
              id,
              type: params.type,
              topic: params.topic,
            });
          }
        } catch {}
      };

      es.addEventListener("queued", () => genStore.setStep("queued"));
      es.addEventListener("started", () => genStore.setStep("started"));
      es.addEventListener("step", (e: MessageEvent) =>
        handleStepPayload(e.data)
      );
      es.addEventListener("heartbeat", () => {});
      es.addEventListener("complete", async (e: MessageEvent) => {
        if (streamFinished) return;
        try {
          let id: number | undefined = undefined;
          const raw = (e as MessageEvent).data as unknown;
          if (typeof raw === "string" && raw.trim().length > 0) {
            try {
              const parsed = JSON.parse(raw);
              id =
                parsed && typeof parsed.id === "number" ? parsed.id : undefined;
            } catch {
              id = undefined;
            }
          } else if (
            raw &&
            typeof raw === "object" &&
            typeof (raw as { id?: unknown }).id === "number"
          ) {
            id = (raw as { id?: unknown }).id as number;
          }
          if (typeof id === "number") {
            steps.forEach((k) => markComplete(k));
            genStore.setStep("complete");
            streamFinished = true;
            es.close();
            await onComplete({
              id,
              type: params.type,
              topic: params.topic,
            });
          }
        } catch {
          streamFinished = true;
          try {
            es.close();
          } catch {}
          markAllComplete();
        }
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
