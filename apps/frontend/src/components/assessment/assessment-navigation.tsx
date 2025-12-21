"use client";

import React from "react";
import { ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AssessmentNavigationProps {
  currentIndex: number;
  totalPassages: number;
  canGoNext: boolean;
  canGoPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onGoToPassage: (index: number) => void;
  isComplete: boolean;
  onSubmit: () => void;
  isSubmitting?: boolean;
}

export const AssessmentNavigation: React.FC<AssessmentNavigationProps> = ({
  currentIndex,
  totalPassages,
  canGoNext,
  canGoPrevious,
  onNext,
  onPrevious,
  onGoToPassage,
  isComplete,
  onSubmit,
  isSubmitting = false,
}) => {
  const isLastPassage = currentIndex === totalPassages - 1;
  const showSubmit = isComplete && isLastPassage;

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center space-x-2">
        {Array.from({ length: totalPassages }, (_, index) => (
          <button
            key={index}
            onClick={() => onGoToPassage(index)}
            className={cn(
              "w-3 h-3 rounded-full transition-all duration-200 cursor-pointer",
              index === currentIndex
                ? "bg-[#4040f2] w-8"
                : index < currentIndex
                  ? "bg-green-500 hover:bg-green-400"
                  : "bg-[#404040] hover:bg-[#4040f2]/50"
            )}
            title={`Passage ${index + 1}`}
          />
        ))}
      </div>

      {/* Progress Text */}
      <div className="text-center">
        <p className="text-[#a6a6a6] font-inter text-sm">
          Passage {currentIndex + 1} of {totalPassages}
        </p>
      </div>

      {/* Navigation Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Previous Button */}
        <button
          onClick={onPrevious}
          disabled={!canGoPrevious}
          className={cn(
            "w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-inter font-medium transition-all duration-200",
            canGoPrevious
              ? "bg-[#2e323a] hover:bg-[#404040] text-white border border-[#404040] cursor-pointer"
              : "bg-[#1a1d23] text-[#666666] border border-[#333333] cursor-not-allowed"
          )}
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        {/* Next/Submit Button */}
        <div className="w-full sm:w-auto">
          {!showSubmit ? (
            <button
              onClick={onNext}
              disabled={!canGoNext}
              className={cn(
                "w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-inter font-medium transition-all duration-200 shadow-lg shadow-blue-500/10",
                canGoNext
                  ? "bg-[#4040f2] hover:bg-[#3636d9] text-white cursor-pointer"
                  : "bg-[#2e323a] text-[#666666] border border-[#404040] cursor-not-allowed"
              )}
            >
              Next Passage
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onSubmit}
              disabled={isSubmitting}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-10 py-4 bg-gradient-to-r from-[#31c48d] to-[#27a375] hover:from-[#27a375] hover:to-[#1e825c] disabled:from-[#2e323a] disabled:to-[#2e323a] disabled:text-[#666666] text-white font-inter font-bold rounded-2xl transition-all duration-200 shadow-xl shadow-[#31c48d]/20 disabled:shadow-none cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className="w-6 h-6" />
                  Submit Assessment
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Instructions */}
      {!isComplete && (
        <div className="text-center bg-[#1a1d23]/50 rounded-lg py-2">
          <p className="text-[11px] text-[#666666] font-inter uppercase tracking-wider">
            Visit all passages to enable submission
          </p>
        </div>
      )}

      {/* Complete Message */}
      {showSubmit && (
        <div className="bg-[#31c48d]/10 border border-[#31c48d]/30 rounded-2xl p-6 text-center shadow-inner">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#31c48d]/20 mb-3">
            <CheckCircle className="w-6 h-6 text-[#31c48d]" />
          </div>
          <h3 className="text-xl font-inter font-bold text-[#31c48d] mb-1">
            Assessment Ready!
          </h3>
          <p className="text-sm text-[#31c48d]/80 font-inter max-w-sm mx-auto">
            Great job! You&apos;ve reviewed all passages. Submit now to see your placement results.
          </p>
        </div>
      )}
    </div>
  );
};
