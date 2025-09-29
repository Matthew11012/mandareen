"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PassageDisplay } from "./passage-display";
import { AssessmentNavigation } from "./assessment-navigation";
import { useAssessmentStore } from "@/lib/stores/assessment-store";
import { AlertTriangle, Target } from "lucide-react";
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
  } = useAssessmentStore();

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Start assessment on component mount (guarded to avoid duplicate calls under React Strict Mode)
  useEffect(() => {
    if (!session && !isLoading) {
      startAssessment();
    }
  }, [startAssessment, session, isLoading]);

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
  if (isLoading && !session) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center">
          <Target className="w-8 h-8 text-blue-400 animate-pulse" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-inter font-semibold text-white">
            Preparing Your Assessment
          </h2>
          <p className="text-[#a6a6a6] font-inter">
            Generating personalized passages...
          </p>
          <div className="flex justify-center">
            <div className="w-8 h-8 animate-spin rounded-full border-2 border-[#4040f2] border-t-transparent" />
          </div>
        </div>
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

      {/* Passage Display */}
      <PassageDisplay
        passage={currentPassage}
        wordResponses={currentResponse?.wordResponses || []}
        onWordResponse={addWordResponse}
        onRemoveWordResponse={removeWordResponse}
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
