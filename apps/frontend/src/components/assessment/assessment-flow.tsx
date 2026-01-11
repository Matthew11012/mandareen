"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { PassageDisplay } from "./passage-display";
import { AssessmentNavigation } from "./assessment-navigation";
import { useAssessmentStore } from "@/lib/stores/assessment-store";
import {
  useAssessmentGenerationStore,
  AssessmentProgressKey,
} from "@/lib/stores/assessment-generation-store";
// types kept in store usage; no direct imports needed here
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AssessmentFlowProps {
  onComplete: (levelPlaced: number) => void;
  autoStart?: boolean;
}

export const AssessmentFlow: React.FC<AssessmentFlowProps> = ({
  onComplete,
  autoStart = false,
}) => {
  const router = useRouter();
  const {
    session,
    isLoading,
    error,
    startAssessment,
    nextPassage,
    previousPassage,
    goToPassage,
    addWordResponse,
    removeWordResponse,
    getCurrentPassageResponse,
    submitAssessment,
    clearError,
    checkCompletion,
  } = useAssessmentStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const genStore = useAssessmentGenerationStore();
  const initializedRef = useRef(false);
  // removed SSE fallback
  // const fallbackTriggeredRef = useRef(false);

  // Multi-select state for bulk marking (must be before any returns)
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedWords, setSelectedWords] = useState<
    Record<string, { word: string; startIndex: number; endIndex: number }>
  >({});
  const toggleSelectWord = (
    key: string,
    data: { word: string; startIndex: number; endIndex: number }
  ) => {
    setSelectedWords((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = data;
      return next;
    });
  };
  const clearSelection = () => setSelectedWords({});
  const applyBulkStatus = (status: "unknown" | "partial") => {
    const entries = Object.values(selectedWords);
    if (entries.length === 0) return;
    for (const item of entries) {
      addWordResponse({
        word: item.word,
        status,
        startIndex: item.startIndex,
        endIndex: item.endIndex,
      });
    }
  };

  // order defined once for faux progress (inlined where used)

  // Start or reattach on mount (non-SSE only)
  useEffect(() => {
    const run = async () => {
      if (session || isLoading) return;
      const stale = genStore.startedAt
        ? Date.now() - genStore.startedAt > 10 * 60 * 1000
        : false;
      if (stale) genStore.reset();

      // If already in progress from persisted state, do NOT trigger another request.
      // Just wait for the original request to complete and set session.
      if (genStore.inProgress && !initializedRef.current) {
        initializedRef.current = true;
        return;
      }

      // Fresh start
      if (!genStore.inProgress && autoStart && !initializedRef.current) {
        initializedRef.current = true;
        genStore.start({ passageCount: 4, maxLevel: 7 });
        await startAssessment();
      }
    };
    void run();
    return () => {};
  }, [session, isLoading, genStore, startAssessment, autoStart]);

  // Check completion status whenever session changes
  useEffect(() => {
    if (session) {
      checkCompletion();
    }
  }, [session, checkCompletion]);

  // If session is ready but generation state persists (eg, fallback non-stream path), finish loading
  useEffect(() => {
    if (session && genStore.inProgress) {
      genStore.finish();
    }
  }, [session, genStore]);

  // Faux progress driver when using non-stream fallback: advance steps on a timer until session arrives
  const fauxIdxRef = useRef(0);
  const fauxTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!genStore.inProgress || session) {
      if (fauxTimerRef.current) {
        clearInterval(fauxTimerRef.current);
        fauxTimerRef.current = null;
      }
      fauxIdxRef.current = 0;
      return;
    }
    const steps = [
      "openai_generate_passage_1",
      "segment_passage_1",
      "openai_generate_passage_2",
      "segment_passage_2",
      "openai_generate_passage_3",
      "segment_passage_3",
      "openai_generate_passage_4",
      "segment_passage_4",
    ] as const;
    const tickMs = 6000; // ~32s total; adjust as needed
    if (fauxTimerRef.current) clearInterval(fauxTimerRef.current);
    fauxTimerRef.current = setInterval(() => {
      if (session) {
        if (fauxTimerRef.current) clearInterval(fauxTimerRef.current);
        fauxTimerRef.current = null;
        return;
      }
      const idx = fauxIdxRef.current;
      const key = steps[idx];
      if (key) {
        genStore.setStep(key as AssessmentProgressKey);
        genStore.markCompleted(key);
        fauxIdxRef.current = idx + 1;
      } else {
        if (fauxTimerRef.current) clearInterval(fauxTimerRef.current);
        fauxTimerRef.current = null;
      }
    }, tickMs);
    return () => {
      if (fauxTimerRef.current) {
        clearInterval(fauxTimerRef.current);
        fauxTimerRef.current = null;
      }
    };
  }, [genStore, genStore.inProgress, session]);

  // Handle assessment submission
  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const result = await submitAssessment();
      if (result) {
        onComplete(result.levelPlaced);
      }
    } catch (error) {
      console.error("Submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if ((isLoading && !session) || genStore.inProgress) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        {/* Animated spinner with spring animation */}
        <div className="relative">
          <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center">
            <div
              className="w-12 h-12 border-3 border-blue-400/30 border-t-blue-400 rounded-full animate-spin"
              style={{
                animation:
                  "spin 1s linear infinite, pulse 2s ease-in-out infinite",
              }}
            />
          </div>
          {/* Pulsing ring effect */}
          <div
            className="absolute inset-0 w-20 h-20 border-2 border-blue-400/20 rounded-full"
            style={{
              animation: "pulse-ring 2s ease-in-out infinite",
            }}
          />
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-xl font-inter font-semibold text-white">
            Preparing Your Assessment
          </h2>
          <p className="text-[#a6a6a6] font-inter">
            Generating personalized passages...
          </p>

          {/* Progress bar */}
          <div className="w-64 h-2 bg-[#3a3f47] rounded-full overflow-hidden mt-4">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${(Object.keys(genStore.completedSteps).length / 8) * 100}%`,
                animation: "progress-shimmer 2s ease-in-out infinite",
              }}
            />
          </div>

          <div className="mt-6 max-w-md mx-auto text-left">
            <ul className="space-y-3">
              {(
                [
                  "openai_generate_passage_1",
                  "segment_passage_1",
                  "openai_generate_passage_2",
                  "segment_passage_2",
                  "openai_generate_passage_3",
                  "segment_passage_3",
                  "openai_generate_passage_4",
                  "segment_passage_4",
                ] as const
              ).map((k) => {
                const completed = !!genStore.completedSteps[k];
                const active = genStore.step === k;
                return (
                  <li key={k} className="flex items-center gap-3">
                    <div className="relative w-3 h-3 flex items-center justify-center">
                      <span
                        className={`inline-block w-3 h-3 rounded-full transition-all duration-300 ${
                          completed
                            ? "bg-[#31c48d] scale-110"
                            : active
                              ? "bg-[#ffd166] scale-125 animate-pulse"
                              : "bg-[#3a3f47]"
                        }`}
                        style={{
                          animation: active
                            ? "step-pulse 1.5s ease-in-out infinite"
                            : undefined,
                        }}
                      />
                      {/* Active step glow effect */}
                      {active && (
                        <div
                          className="absolute w-5 h-5 rounded-full bg-[#ffd166]/30"
                          style={{
                            animation: "step-glow 1.5s ease-in-out infinite",
                          }}
                        />
                      )}
                    </div>
                    <span
                      className={`text-sm transition-all duration-300 ${
                        completed
                          ? "text-[#31c48d]"
                          : active
                            ? "text-[#ffd166] font-medium"
                            : "text-[#c9d1d9]"
                      }`}
                    >
                      {k.startsWith("openai_generate_passage_") &&
                        `Generating passage ${k.slice(-1)}`}
                      {k.startsWith("segment_passage_") &&
                        `Segmenting passage ${k.slice(-1)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <style jsx>{`
          @keyframes pulse-ring {
            0% {
              transform: scale(1);
              opacity: 1;
            }
            100% {
              transform: scale(1.4);
              opacity: 0;
            }
          }

          @keyframes progress-shimmer {
            0% {
              background-position: -200% 0;
            }
            100% {
              background-position: 200% 0;
            }
          }

          @keyframes step-pulse {
            0%,
            100% {
              transform: scale(1);
              opacity: 1;
            }
            50% {
              transform: scale(1.2);
              opacity: 0.8;
            }
          }

          @keyframes step-glow {
            0%,
            100% {
              transform: scale(1);
              opacity: 0.3;
            }
            50% {
              transform: scale(1.5);
              opacity: 0.1;
            }
          }
        `}</style>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <div className="text-center space-y-4">
          <h2 className="text-xl font-inter font-semibold text-white">
            Assessment Error
          </h2>
          <p className="text-[#a6a6a6] font-inter max-w-md">{error}</p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                clearError();
                startAssessment();
              }}
              className="px-6 py-3 bg-[#4040f2] hover:bg-[#3636d9] text-white font-inter font-medium rounded-xl transition-colors duration-200 cursor-pointer"
            >
              Try Again
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="px-6 py-3 bg-[#2e323a] hover:bg-[#404040] text-white font-inter font-medium rounded-xl border border-[#404040] transition-colors duration-200 cursor-pointer"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No session state
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-yellow-400" />
        </div>
        <div className="text-center space-y-4">
          <h2 className="text-xl font-inter font-semibold text-white">
            No Assessment Session
          </h2>
          <p className="text-[#a6a6a6] font-inter">
            Unable to load assessment. Please try starting again.
          </p>
          <button
            onClick={() => router.push("/assessment")}
            className="px-6 py-3 bg-[#4040f2] hover:bg-[#3636d9] text-white font-inter font-medium rounded-xl transition-colors duration-200 cursor-pointer"
          >
            Restart Assessment
          </button>
        </div>
      </div>
    );
  }

  const currentPassage = session.passages[session.currentPassageIndex];
  const currentResponse = getCurrentPassageResponse();
  const totalMarkedWords = session.responses.reduce(
    (total, response) => total + response.wordResponses.length,
    0
  );

  return (
    <div
      className={cn(
        "max-w-4xl mx-auto space-y-8 px-0",
        multiSelect && "pb-32 sm:pb-0"
      )}
    >
      {/* Header */}
      <div className="text-center space-y-2 pt-4">
        <h1 className="text-3xl font-inter font-extrabold text-white tracking-tight">
          Mandarin Placement Test
        </h1>
        <div className="flex items-center justify-center gap-2">
          <div className="h-1 w-12 bg-[#4040f2] rounded-full" />
          <p className="text-[#a6a6a6] font-inter text-sm font-medium">
            {totalMarkedWords} words marked across all passages
          </p>
          <div className="h-1 w-12 bg-[#4040f2] rounded-full" />
        </div>
      </div>

      {/* Multi-select Controls */}
      <div
        className={cn(
          "flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#1a1d23] rounded-xl p-3 border border-[#404040] transition-all duration-300",
          multiSelect ? "w-full" : "inline-flex w-auto"
        )}
      >
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => {
              if (multiSelect) {
                setMultiSelect(false);
                clearSelection();
              } else {
                setMultiSelect(true);
              }
            }}
            className={cn(
              "flex-1 sm:flex-none px-4 py-2.5 rounded-lg font-inter font-medium transition-all duration-200 cursor-pointer text-sm whitespace-nowrap",
              multiSelect
                ? "bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20"
                : "bg-[#2e323a] text-[#a6a6a6] border border-[#404040] hover:border-[#4040f2] hover:text-white"
            )}
          >
            {multiSelect ? "Cancel Selection" : "Select Multiple Words"}
          </motion.button>

          {!multiSelect && (
            <div className="hidden sm:block text-xs text-[#666666]">
              Select multiple words to mark them at once
            </div>
          )}
        </div>

        {multiSelect && (
          <div className="hidden sm:flex items-center gap-2 w-full sm:w-auto">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => applyBulkStatus("unknown")}
              disabled={Object.keys(selectedWords).length === 0}
              className="px-4 py-2 bg-red-500/20 text-red-300 border border-red-500/40 rounded-lg hover:border-red-500 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Mark Unknown ({Object.keys(selectedWords).length})
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => applyBulkStatus("partial")}
              disabled={Object.keys(selectedWords).length === 0}
              className="px-4 py-2 bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 rounded-lg hover:border-yellow-500 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Mark Partial ({Object.keys(selectedWords).length})
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={clearSelection}
              disabled={Object.keys(selectedWords).length === 0}
              className="px-4 py-2 bg-[#2e323a] text-white/80 border border-[#404040] rounded-lg hover:border-[#9aa6ff] transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Clear
            </motion.button>
          </div>
        )}
      </div>

      {/* Mobile Multi-select Sticky Bar */}
      {multiSelect && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 p-4 mb-0 ">
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="bg-[#1a1d23] border border-[#404040] rounded-2xl p-4 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-inter font-medium text-white">
                {Object.keys(selectedWords).length} words selected
              </div>
              <button
                onClick={clearSelection}
                disabled={Object.keys(selectedWords).length === 0}
                className="text-xs text-[#a6a6a6] hover:text-white disabled:opacity-50 transition-colors"
              >
                Clear Selection
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => applyBulkStatus("unknown")}
                disabled={Object.keys(selectedWords).length === 0}
                className="flex flex-col items-center justify-center gap-1 py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl active:bg-red-500/20 transition-all disabled:opacity-50"
              >
                <span className="text-sm font-bold">Mark Unknown</span>
              </button>
              <button
                onClick={() => applyBulkStatus("partial")}
                disabled={Object.keys(selectedWords).length === 0}
                className="flex flex-col items-center justify-center gap-1 py-3 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-xl active:bg-yellow-500/20 transition-all disabled:opacity-50"
              >
                <span className="text-sm font-bold">Mark Partial</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Passage Display */}
      <PassageDisplay
        passage={currentPassage}
        wordResponses={currentResponse?.wordResponses || []}
        onWordResponse={addWordResponse}
        onRemoveWordResponse={removeWordResponse}
        multiSelect={multiSelect}
        selectedKeys={new Set(Object.keys(selectedWords))}
        onToggleSelect={(key, word, startIndex, endIndex) =>
          toggleSelectWord(key, { word, startIndex, endIndex })
        }
      />

      {/* Navigation */}
      <AssessmentNavigation
        currentIndex={session.currentPassageIndex}
        totalPassages={session.passages.length}
        canGoNext={session.currentPassageIndex < session.passages.length - 1}
        canGoPrevious={session.currentPassageIndex > 0}
        onNext={nextPassage}
        onPrevious={previousPassage}
        onGoToPassage={goToPassage}
        isComplete={session.isComplete}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Progress Summary */}
      <div className="bg-[#1a1d23] rounded-2xl p-6 border border-[#404040] shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-inter font-bold text-white">
            Assessment Progress
          </h3>
          <div className="text-xs font-inter text-[#a6a6a6] bg-[#2e323a] px-3 py-1 rounded-full border border-[#404040]">
            {session.passages.length} Passages Total
          </div>
        </div>
        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-4">
          {session.passages.map((passage, index) => {
            const passageResponse = session.responses.find(
              (r) => r.passageId === passage.id
            );
            const markedWords = passageResponse?.wordResponses.length || 0;
            const isCurrent = index === session.currentPassageIndex;

            return (
              <motion.div
                key={passage.id}
                whileHover={{ y: -2 }}
                className={cn(
                  "relative overflow-hidden p-4 rounded-xl border cursor-pointer transition-all duration-300",
                  isCurrent
                    ? "border-[#4040f2] bg-[#4040f2]/5 shadow-[0_0_15px_rgba(64,64,242,0.1)]"
                    : "border-[#404040] hover:border-[#4040f2]/30 hover:bg-[#2e323a]/50"
                )}
                onClick={() => goToPassage(index)}
              >
                {isCurrent && (
                  <div className="absolute top-0 right-0 p-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#4040f2] animate-pulse" />
                  </div>
                )}
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-colors",
                      markedWords > 0
                        ? "bg-[#31c48d]/20 text-[#31c48d]"
                        : isCurrent
                          ? "bg-[#4040f2] text-white"
                          : "bg-[#2e323a] text-[#a6a6a6]"
                    )}
                  >
                    {index + 1}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-inter font-bold text-white leading-tight">
                      Passage {index + 1}
                    </span>
                    <span className="text-[10px] text-[#a6a6a6] uppercase tracking-wider font-semibold">
                      {markedWords} words
                    </span>
                  </div>
                </div>
                {/* Progress Mini Bar */}
                <div className="w-full h-1 bg-[#2e323a] rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-500",
                      markedWords > 0
                        ? "bg-[#31c48d]"
                        : isCurrent
                          ? "bg-[#4040f2]"
                          : "bg-transparent"
                    )}
                    style={{
                      width:
                        markedWords > 0 ? "100%" : isCurrent ? "50%" : "0%",
                    }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
