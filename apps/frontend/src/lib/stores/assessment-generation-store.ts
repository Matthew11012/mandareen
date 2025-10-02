import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AssessmentProgressKey =
  | "queued"
  | "started"
  | "complete"
  | `openai_generate_passage_1`
  | `segment_passage_1`
  | `openai_generate_passage_2`
  | `segment_passage_2`
  | `openai_generate_passage_3`
  | `segment_passage_3`
  | `openai_generate_passage_4`
  | `segment_passage_4`;

interface AssessmentGenParams {
  maxLevel?: number;
  passageCount?: number;
}

interface AssessmentGenerationState {
  inProgress: boolean;
  startedAt: number | null;
  params?: AssessmentGenParams | null;
  step: AssessmentProgressKey | null;
  completedSteps: Record<string, boolean>;
  start: (p?: AssessmentGenParams) => void;
  setStep: (k: AssessmentProgressKey) => void;
  markCompleted: (k: string) => void;
  finish: () => void;
  reset: () => void;
}

export const useAssessmentGenerationStore = create<AssessmentGenerationState>()(
  persist(
    (set) => ({
      inProgress: false,
      startedAt: null,
      params: null,
      step: null,
      completedSteps: {},
      start: (p) =>
        set({
          inProgress: true,
          startedAt: Date.now(),
          params: p || null,
          step: "queued",
          completedSteps: {},
        }),
      setStep: (k) => set({ step: k }),
      markCompleted: (k) =>
        set((s) => ({ completedSteps: { ...s.completedSteps, [k]: true } })),
      finish: () => set({ inProgress: false }),
      reset: () =>
        set({
          inProgress: false,
          startedAt: null,
          params: null,
          step: null,
          completedSteps: {},
        }),
    }),
    {
      name: "assessment-generation-store",
      partialize: (s) => ({
        inProgress: s.inProgress,
        startedAt: s.startedAt,
        params: s.params,
        step: s.step,
        completedSteps: s.completedSteps,
      }),
    }
  )
);
