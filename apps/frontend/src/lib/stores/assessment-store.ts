import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AssessmentSession,
  WordResponse,
  PassageResponse,
  WordStatus,
} from "../types/assessment";
import { assessmentApi } from "../api/assessment";
import { useAssessmentGenerationStore } from "./assessment-generation-store";

interface AssessmentState {
  // Session data
  session: AssessmentSession | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  startAssessment: () => Promise<void>;
  nextPassage: () => void;
  previousPassage: () => void;
  goToPassage: (index: number) => void;
  addWordResponse: (response: WordResponse) => void;
  updateWordResponse: (word: string, status: WordStatus) => void;
  removeWordResponse: (word: string) => void;
  getCurrentPassageResponse: () => PassageResponse | undefined;
  submitAssessment: () => Promise<{ levelPlaced: number } | null>;
  resetAssessment: () => void;
  clearError: () => void;
  checkCompletion: () => void;
  setSession: (session: AssessmentSession | null) => void;
  checkSessionExpiry: () => void;
}

export const useAssessmentStore = create<AssessmentState>()(
  persist(
    (set, get) => ({
      session: null,
      isLoading: false,
      error: null,

      // Helper function to check and update completion status
      checkCompletion: () => {
        const { session } = get();
        if (!session) return;

        const uniqueVisited = new Set(session.visitedPassages);
        const isComplete = uniqueVisited.size === session.passages.length;

        if (session.isComplete !== isComplete) {
          set({
            session: {
              ...session,
              isComplete,
            },
          });
        }
      },

      startAssessment: async () => {
        const { isLoading, session } = get();
        if (isLoading || session) return; // prevent duplicate requests
        const gen = useAssessmentGenerationStore.getState();
        const defaults = { passageCount: 4, maxLevel: 7 };

        set({ isLoading: true, error: null });
        if (!gen.inProgress) {
          gen.start(defaults);
        }

        try {
          const passages = await assessmentApi.getQuestions(
            defaults,
            { timeoutMs: 120000 },
          );

          const session: AssessmentSession = {
            passages,
            responses: passages.map((passage) => ({
              passageId: passage.id,
              wordResponses: [],
            })),
            currentPassageIndex: 0,
            isComplete: false,
            startedAt: new Date(),
            visitedPassages: [0], // Track visited passages, start with first passage
          };

          set({ session, isLoading: false });
          gen.finish();

          // Check completion status after setting session
          get().checkCompletion();
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to start assessment";
          set({ error: errorMessage, isLoading: false });
          gen.reset();
          // Re-throw to allow callers to handle the error with full error object
          throw error;
        }
      },

      nextPassage: () => {
        const { session } = get();
        if (!session) return;

        const nextIndex = session.currentPassageIndex + 1;
        if (nextIndex < session.passages.length) {
          const updatedVisitedPassages = session.visitedPassages.includes(
            nextIndex
          )
            ? session.visitedPassages
            : [...session.visitedPassages, nextIndex];

          const uniqueVisited = new Set(updatedVisitedPassages);
          const isComplete = uniqueVisited.size === session.passages.length;

          set({
            session: {
              ...session,
              currentPassageIndex: nextIndex,
              visitedPassages: updatedVisitedPassages,
              isComplete,
            },
          });

          // Double-check completion status
          get().checkCompletion();
        }
      },

      previousPassage: () => {
        const { session } = get();
        if (!session) return;

        const prevIndex = session.currentPassageIndex - 1;
        if (prevIndex >= 0) {
          const updatedVisitedPassages = session.visitedPassages.includes(
            prevIndex
          )
            ? session.visitedPassages
            : [...session.visitedPassages, prevIndex];

          const uniqueVisited = new Set(updatedVisitedPassages);
          const isComplete = uniqueVisited.size === session.passages.length;

          set({
            session: {
              ...session,
              currentPassageIndex: prevIndex,
              visitedPassages: updatedVisitedPassages,
              isComplete,
            },
          });

          // Double-check completion status
          get().checkCompletion();
        }
      },

      goToPassage: (index: number) => {
        const { session } = get();
        if (!session || index < 0 || index >= session.passages.length) return;

        const updatedVisitedPassages = session.visitedPassages.includes(index)
          ? session.visitedPassages
          : [...session.visitedPassages, index];

        const uniqueVisited = new Set(updatedVisitedPassages);
        const isComplete = uniqueVisited.size === session.passages.length;

        set({
          session: {
            ...session,
            currentPassageIndex: index,
            visitedPassages: updatedVisitedPassages,
            isComplete,
          },
        });

        // Double-check completion status
        get().checkCompletion();
      },

      addWordResponse: (response: WordResponse) => {
        const { session } = get();
        if (!session) return;

        const currentPassageId =
          session.passages[session.currentPassageIndex].id;
        const responses = [...session.responses];
        const passageResponseIndex = responses.findIndex(
          (r) => r.passageId === currentPassageId
        );

        if (passageResponseIndex !== -1) {
          const existingWordIndex = responses[
            passageResponseIndex
          ].wordResponses.findIndex((w) => w.word === response.word);

          if (existingWordIndex !== -1) {
            // Update existing word response
            responses[passageResponseIndex].wordResponses[existingWordIndex] =
              response;
          } else {
            // Add new word response
            responses[passageResponseIndex].wordResponses.push(response);
          }

          set({
            session: {
              ...session,
              responses,
            },
          });
        }
      },

      updateWordResponse: (word: string, status: WordStatus) => {
        const { session } = get();
        if (!session) return;

        const currentPassageId =
          session.passages[session.currentPassageIndex].id;
        const responses = [...session.responses];
        const passageResponseIndex = responses.findIndex(
          (r) => r.passageId === currentPassageId
        );

        if (passageResponseIndex !== -1) {
          const wordResponseIndex = responses[
            passageResponseIndex
          ].wordResponses.findIndex((w) => w.word === word);

          if (wordResponseIndex !== -1) {
            responses[passageResponseIndex].wordResponses[wordResponseIndex] = {
              ...responses[passageResponseIndex].wordResponses[
                wordResponseIndex
              ],
              status,
            };

            set({
              session: {
                ...session,
                responses,
              },
            });
          }
        }
      },

      removeWordResponse: (word: string) => {
        const { session } = get();
        if (!session) return;

        const currentPassageId =
          session.passages[session.currentPassageIndex].id;
        const responses = [...session.responses];
        const passageResponseIndex = responses.findIndex(
          (r) => r.passageId === currentPassageId
        );

        if (passageResponseIndex !== -1) {
          responses[passageResponseIndex].wordResponses = responses[
            passageResponseIndex
          ].wordResponses.filter((w) => w.word !== word);

          set({
            session: {
              ...session,
              responses,
            },
          });
        }
      },

      getCurrentPassageResponse: () => {
        const { session } = get();
        if (!session) return undefined;

        const currentPassageId =
          session.passages[session.currentPassageIndex].id;
        return session.responses.find((r) => r.passageId === currentPassageId);
      },

      submitAssessment: async () => {
        const { session } = get();
        if (!session) return null;

        set({ isLoading: true, error: null });

        try {
          // Transform frontend data to backend format
          const wordAssessments: Array<{
            word: string;
            knowledge: "known" | "partial" | "unknown";
            hskLevel: number;
          }> = [];

          // Process each passage and its responses
          for (const response of session.responses) {
            const passage = session.passages.find(
              (p) => p.id === response.passageId
            );
            if (!passage) continue;

            // Create a map of word responses for quick lookup
            const wordResponseMap = new Map(
              response.wordResponses.map((wr) => [wr.word, wr.status])
            );

            // Prefer backend segments (full coverage); fallback to words list
            if (passage.segments && passage.segments.length > 0) {
              for (const seg of passage.segments) {
                if (!seg.isWord) continue; // skip spaces/punctuation
                const status = wordResponseMap.get(seg.text) || "known";
                wordAssessments.push({
                  word: seg.text,
                  knowledge: status,
                  hskLevel: seg.hskLevel ?? 0,
                });
              }
            } else {
              // Fallback to words list
              for (const word of passage.words) {
                const status = wordResponseMap.get(word.text) || "known"; // Default to known

                wordAssessments.push({
                  word: word.text,
                  knowledge: status,
                  hskLevel: word.hskLevel,
                });
              }
            }
          }

          const result = await assessmentApi.submitAssessment({
            wordAssessments,
          });

          // Clear session after successful submission so re-entering shows intro
          set({ isLoading: false, session: null });
          return result;
        } catch (error) {
          console.error("Assessment submission error:", error);
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to submit assessment";
          set({ error: errorMessage, isLoading: false });
          return null;
        }
      },

      resetAssessment: () => {
        set({
          session: null,
          isLoading: false,
          error: null,
        });
      },

      clearError: () => {
        set({ error: null });
      },

      setSession: (session: AssessmentSession | null) => {
        set({ session });
      },

      checkSessionExpiry: () => {
        const { session } = get();
        if (!session) return;

        // startedAt can be a Date (fresh) or a string (rehydrated from storage)
        const startedAtMs = (() => {
          const raw = (session as { startedAt?: unknown }).startedAt;
          if (!raw) return 0;
          if (typeof raw === "string") {
            const parsed = Date.parse(raw);
            return Number.isNaN(parsed) ? 0 : parsed;
          }
          if (raw instanceof Date) return raw.getTime();
          // Numeric epoch fallback
          if (typeof raw === "number") return raw;
          try {
            const parsed = Date.parse(String(raw));
            return Number.isNaN(parsed) ? 0 : parsed;
          } catch {
            return 0;
          }
        })();

        if (!startedAtMs) return;

        // Check if session is older than 24 hours
        const sessionAge = Date.now() - startedAtMs;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

        if (sessionAge > maxAge) {
          set({ session: null });
        }
      },
    }),
    {
      name: "assessment-session",
      partialize: (state) => ({
        session: state.session,
      }),
    }
  )
);
