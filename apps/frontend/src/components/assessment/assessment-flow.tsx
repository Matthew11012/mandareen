"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PassageDisplay } from "./passage-display";
import { AssessmentNavigation } from "./assessment-navigation";
import { useAssessmentStore } from "@/lib/stores/assessment-store";
import {
  useAssessmentGenerationStore,
  AssessmentProgressKey,
} from "@/lib/stores/assessment-generation-store";
import type {
  AssessmentSession,
  AssessmentPassage,
} from "@/lib/types/assessment";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AssessmentFlowProps {
  onComplete: (levelPlaced: number) => void;
}

export const AssessmentFlow: React.FC<AssessmentFlowProps> = ({
  onComplete,
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
    setSession,
  } = useAssessmentStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const genStore = useAssessmentGenerationStore();
  const initializedRef = useRef(false);
  const fallbackTriggeredRef = useRef(false);

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

  const progressStepsOrder = useMemo(
    () =>
      [
        "openai_generate_passage_1",
        "segment_passage_1",
        "openai_generate_passage_2",
        "segment_passage_2",
        "openai_generate_passage_3",
        "segment_passage_3",
        "openai_generate_passage_4",
        "segment_passage_4",
      ] as const,
    []
  );

  // Start assessment on component mount (strict guard to avoid duplicate calls under React Strict Mode)
  useEffect(() => {
    if (
      !session &&
      !isLoading &&
      !genStore.inProgress &&
      !initializedRef.current
    ) {
      initializedRef.current = true;
      // Start SSE progress + data fetch
      try {
        genStore.start({ passageCount: 4, maxLevel: 7 });
        const base = (
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"
        ).replace(/\/$/, "");
        const token =
          typeof window !== "undefined"
            ? localStorage.getItem("auth-token")
            : null;
        if (!token) throw new Error("No auth token");
        const params = new URLSearchParams({ token, passageCount: String(4) });
        const url = `${base}/assess/questions/stream?${params.toString()}`;
        const es = new EventSource(url);
        let streamFinished = false;

        const markComplete = (key: string) => genStore.markCompleted(key);
        const handleStep = (raw: unknown) => {
          let key: string | undefined;
          try {
            const payload =
              typeof raw === "string"
                ? JSON.parse(raw)
                : (raw as { key?: string });
            key = payload?.key;
          } catch {}
          if (!key) return;
          genStore.setStep(key as AssessmentProgressKey);
          const idx = progressStepsOrder.indexOf(
            key as (typeof progressStepsOrder)[number]
          );
          if (idx > 0)
            for (let i = 0; i < idx; i++) markComplete(progressStepsOrder[i]);
        };

        es.addEventListener("queued", () => genStore.setStep("queued"));
        es.addEventListener("started", () => genStore.setStep("started"));
        es.addEventListener("step", (e: MessageEvent) => handleStep(e.data));
        es.addEventListener("heartbeat", () => {});
        es.addEventListener("complete", async (e) => {
          streamFinished = true;
          try {
            es.close();
          } catch {}
          progressStepsOrder.forEach((k) => markComplete(k));
          genStore.setStep("complete");
          try {
            // Parse the complete event data to get passages
            const eventData =
              typeof e.data === "string" ? JSON.parse(e.data) : e.data;
            if (eventData?.passages) {
              // Create session directly from streamed data
              const session: AssessmentSession = {
                passages: eventData.passages,
                responses: eventData.passages.map(
                  (passage: AssessmentPassage) => ({
                    passageId: passage.id,
                    wordResponses: [],
                  })
                ),
                currentPassageIndex: 0,
                isComplete: false,
                startedAt: new Date(),
                visitedPassages: [0],
              };
              // Update the assessment store directly
              setSession(session);
              checkCompletion();
            } else {
              // Fallback to non-stream endpoint only if no data received
              await startAssessment();
            }
          } finally {
            // Briefly delay finishing to allow users to see the final step state
            await new Promise((r) => setTimeout(r, 600));
            genStore.finish();
          }
        });
        es.addEventListener("error", async () => {
          if (streamFinished) return;
          try {
            es.close();
          } catch {}
          // Grace period to avoid instant jump to the test; keeps progress UI visible
          await new Promise((r) => setTimeout(r, 1200));
          // Fallback to immediate fetch to not block user (only once)
          if (!fallbackTriggeredRef.current) {
            fallbackTriggeredRef.current = true;
            await startAssessment();
          }
          genStore.finish();
        });
      } catch {
        // Fallback on any init error (only once)
        if (!fallbackTriggeredRef.current) {
          fallbackTriggeredRef.current = true;
          void startAssessment();
        }
      }
    }
  }, [
    startAssessment,
    session,
    isLoading,
    genStore,
    progressStepsOrder,
    checkCompletion,
    setSession,
  ]);

  // Check completion status whenever session changes
  useEffect(() => {
    if (session) {
      checkCompletion();
    }
  }, [session, checkCompletion]);

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
                    <div className="relative">
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
                          className="absolute inset-0 w-3 h-3 rounded-full bg-[#ffd166]/30"
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
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-inter font-bold text-white">
          Mandarin Placement Test
        </h1>
        <p className="text-[#a6a6a6] font-inter">
          {totalMarkedWords} words marked across all passages
        </p>
      </div>

      {/* Multi-select Controls */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 bg-[#1a1d23] rounded-xl p-3 border border-[#404040]"
        role="toolbar"
        aria-label="Assessment controls"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={multiSelect}
            onClick={() => {
              if (multiSelect) {
                setMultiSelect(false);
                clearSelection();
              } else {
                setMultiSelect(true);
              }
            }}
            className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#1a1d23] text-[#a6a6a6]"
          >
            {multiSelect ? "Cancel Selection" : "Select Multiple Words"}
          </button>
          {multiSelect && (
            <>
              <button
                type="button"
                onClick={() => applyBulkStatus("unknown")}
                disabled={Object.keys(selectedWords).length === 0}
                className="px-3 py-2 bg-red-500/20 text-red-300 border border-red-500/40 rounded-lg hover:border-red-500 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-400 focus-visible:ring-offset-[#1a1d23]"
              >
                Mark Unknown ({Object.keys(selectedWords).length})
              </button>
              <button
                type="button"
                onClick={() => applyBulkStatus("partial")}
                disabled={Object.keys(selectedWords).length === 0}
                className="px-3 py-2 bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 rounded-lg hover:border-yellow-500 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-[#1a1d23]"
              >
                Mark Partial ({Object.keys(selectedWords).length})
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={Object.keys(selectedWords).length === 0}
                className="px-3 py-2 bg-[#2e323a] text-white/80 border border-[#404040] rounded-lg hover:border-[#9aa6ff] transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#1a1d23]"
              >
                Clear
              </button>
            </>
          )}
        </div>
        {multiSelect && (
          <div className="text-xs text-[#a6a6a6]">
            Tip: Click words to toggle selection.
          </div>
        )}
      </div>

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
      <div className="bg-[#1a1d23] rounded-xl p-6 border border-[#404040]">
        <h3 className="text-lg font-inter font-semibold text-white mb-4">
          Assessment Progress
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {session.passages.map((passage, index) => {
            const passageResponse = session.responses.find(
              (r) => r.passageId === passage.id
            );
            const markedWords = passageResponse?.wordResponses.length || 0;
            const isCurrent = index === session.currentPassageIndex;

            return (
              <div
                key={passage.id}
                className={cn(
                  "p-3 rounded-lg border cursor-pointer transition-all duration-200",
                  isCurrent
                    ? "border-[#4040f2] bg-[#4040f2]/10"
                    : "border-[#404040] hover:border-[#4040f2]/50 hover:bg-[#2e323a]"
                )}
                onClick={() => goToPassage(index)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      markedWords > 0
                        ? "bg-green-400"
                        : isCurrent
                          ? "bg-[#4040f2]"
                          : "bg-[#666666]"
                    )}
                  />
                  <span className="text-sm font-inter font-medium text-white">
                    Passage {index + 1}
                  </span>
                </div>
                <p className="text-xs text-[#a6a6a6] font-inter">
                  {markedWords} words marked
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
