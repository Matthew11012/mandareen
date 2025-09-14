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
      <div className="flex items-center justify-between">
        {/* Previous Button */}
        <button
          onClick={onPrevious}
          disabled={!canGoPrevious}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-xl font-inter font-medium transition-all duration-200",
            canGoPrevious
              ? "bg-[#2e323a] hover:bg-[#404040] text-white border border-[#404040] cursor-pointer"
              : "bg-[#1a1d23] text-[#666666] border border-[#333333] cursor-not-allowed"
          )}
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        {/* Next/Submit Button */}
        {!isComplete ? (
          <button
            onClick={onNext}
            disabled={!canGoNext}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl font-inter font-medium transition-all duration-200",
              canGoNext
                ? "bg-[#4040f2] hover:bg-[#3636d9] text-white shadow-lg shadow-blue-500/20 cursor-pointer"
                : "bg-[#2e323a] text-[#666666] border border-[#404040] cursor-not-allowed"
            )}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-[#2e323a] disabled:to-[#2e323a] disabled:text-[#666666] text-white font-inter font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-green-500/20 disabled:shadow-none cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Submit Assessment
              </>
            )}
          </button>
        )}
      </div>

      {/* Instructions */}
      {!isComplete && (
        <div className="text-center">
          <p className="text-xs text-[#999999] font-inter">
            Navigate through all passages and click words to mark your knowledge
            level. The submit button will appear once you&apos;ve visited all
            passages.
          </p>
        </div>
      )}

      {/* Complete Message */}
      {isComplete && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
          <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
          <h3 className="text-lg font-inter font-semibold text-green-400 mb-1">
            Assessment Complete!
          </h3>
          <p className="text-sm text-green-300 font-inter">
            You&apos;ve visited all passages. Click submit when ready to get
            your placement level.
          </p>
        </div>
      )}
    </div>
  );
};
