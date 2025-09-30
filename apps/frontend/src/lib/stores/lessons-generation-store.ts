import { create } from "zustand";

export type ProgressKey =
  | "openai_generate_dialogue"
  | "openai_generate_story"
  | "segment_dialogue"
  | "segment_story"
  | "rag_retrieve_context"
  | "openai_generate_grammar_notes"
  | "segment_grammar_notes_and_tips"
  | "persist_lesson"
  | "complete"
  | "queued"
  | "started";

interface GenParams {
  level?: number | null;
  topic?: string;
  readTimeMinutes?: number;
}

export interface LessonsGenerationState {
  inProgress: boolean;
  progressStep: ProgressKey | null;
  completedSteps: Record<string, boolean>;
  startedAt: number | null;
  params: GenParams | null;
  attached: boolean; // whether an SSE stream is currently attached
  lessonId?: number | null;

  start: (params: GenParams) => void;
  setStep: (key: ProgressKey) => void;
  markCompleted: (key: string) => void;
  setAttached: (v: boolean) => void;
  setLessonId: (id?: number | null) => void;
  finish: () => void;
  reset: () => void;
}

export const useLessonsGenerationStore = create<LessonsGenerationState>(
  (set) => ({
    inProgress: false,
    progressStep: null,
    completedSteps: {},
    startedAt: null,
    params: null,
    attached: false,
    lessonId: null,

    start: (params) =>
      set({
        inProgress: true,
        params,
        progressStep: null,
        completedSteps: {},
        startedAt: Date.now(),
        lessonId: null,
      }),
    setStep: (key) => set({ progressStep: key }),
    markCompleted: (key) =>
      set((s) => ({ completedSteps: { ...s.completedSteps, [key]: true } })),
    setAttached: (v) => set({ attached: v }),
    setLessonId: (id) => set({ lessonId: id ?? null }),
    finish: () => set({ inProgress: false, attached: false }),
    reset: () =>
      set({
        inProgress: false,
        progressStep: null,
        completedSteps: {},
        startedAt: null,
        params: null,
        attached: false,
        lessonId: null,
      }),
  })
);
