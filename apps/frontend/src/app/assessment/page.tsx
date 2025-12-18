"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import { DashboardLayout } from "@/components/layout";
import { AssessmentFlow, AssessmentResults } from "@/components/assessment";
import { useAssessmentStore } from "@/lib/stores/assessment-store";
import { useAssessmentGenerationStore } from "@/lib/stores/assessment-generation-store";
import { useUsageSummary } from "@/lib/hooks/use-usage";
import {
  AssessmentQuotaBanner,
  type AssessmentQuotaError,
} from "@/components/assessment/assessment-quota-banner";
import { Tooltip } from "@/components/ui/tooltip";
import { Target, Clock, CheckCircle, ArrowRight } from "lucide-react";

type AssessmentPhase = "intro" | "assessment" | "results";

/**
 * Assessment Page (Protected Route)
 *
 * Placement test page where users can assess their Mandarin proficiency level.
 */
export default function AssessmentPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const {
    session,
    resetAssessment,
    checkSessionExpiry,
    startAssessment,
    isLoading: assessmentLoading,
  } = useAssessmentStore();
  const [currentPhase, setCurrentPhase] = useState<AssessmentPhase>("intro");
  const [placementResult, setPlacementResult] = useState<number | null>(null);
  const [quotaError, setQuotaError] = useState<AssessmentQuotaError | null>(
    null
  );
  const errorBannerRef = useRef<HTMLDivElement>(null);
  const genStore = useAssessmentGenerationStore();

  // Fetch usage summary to check assessment_taken quota
  const { data: usageSummary, isLoading: usageLoading } =
    useUsageSummary(!authLoading);

  // Check if assessment generation is at quota limit
  const assessmentUsage = usageSummary?.resources["assessment_taken"];
  const isQuotaExceeded = Boolean(
    assessmentUsage && assessmentUsage.pct >= 100
  );

  // Check for existing session on mount
  useEffect(() => {
    checkSessionExpiry();
  }, [checkSessionExpiry]);

  // Derive the phase to render without setting state inside effects
  const derivedPhase: AssessmentPhase = useMemo(() => {
    if (currentPhase === "results") return "results";
    if (currentPhase === "assessment") return "assessment";
    if (session || genStore.inProgress) return "assessment";
    return "intro";
  }, [currentPhase, session, genStore.inProgress]);

  // Focus error banner when quota error appears
  const activeQuotaError = useMemo(() => {
    if (!quotaError) return null;
    if (assessmentUsage && assessmentUsage.pct < 100) return null;
    return quotaError;
  }, [quotaError, assessmentUsage]);

  useEffect(() => {
    if (activeQuotaError && errorBannerRef.current) {
      errorBannerRef.current.focus();
    }
  }, [activeQuotaError]);

  // Format reset date for tooltip (must be called before any early returns)
  const resetDateText = useMemo(() => {
    if (!assessmentUsage || !assessmentUsage.resetsAt) {
      return "Usage resets at the end of your billing period";
    }
    const resetDate = new Date(assessmentUsage.resetsAt);
    return `Usage resets on ${resetDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }, [assessmentUsage]);

  const handleStartAssessment = async () => {
    // Guard: prevent starting if quota exceeded
    if (isQuotaExceeded) {
      return;
    }

    setQuotaError(null);
    try {
      await startAssessment();
      setCurrentPhase("assessment");
    } catch (e: unknown) {
      // Handle quota/rate limit errors
      const errorResponse =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: unknown }).response
          : null;
      if (
        errorResponse &&
        typeof errorResponse === "object" &&
        errorResponse !== null
      ) {
        const data = errorResponse as Record<string, unknown>;
        const code = typeof data.code === "string" ? data.code : undefined;
        const message =
          typeof data.message === "string" ? data.message : undefined;
        const retryAfter =
          typeof data.retryAfter === "number" ? data.retryAfter : undefined;
        const resource =
          typeof data.resource === "string" ? data.resource : undefined;
        const planCap =
          typeof data.planCap === "number" ? data.planCap : undefined;
        const used = typeof data.used === "number" ? data.used : undefined;

        if (code === "QUOTA_EXCEEDED") {
          setQuotaError({
            type: "quota_exceeded",
            message:
              message ||
              "You've reached your assessment limit for this period.",
            resource,
            planCap,
            used,
          });
          errorBannerRef.current?.focus();
        } else if (code === "RATE_LIMITED") {
          setQuotaError({
            type: "rate_limited",
            message:
              message ||
              "Please slow down. You're starting assessments too quickly.",
            resource,
            retryAfter: retryAfter ? Date.now() + retryAfter * 1000 : undefined,
          });
          errorBannerRef.current?.focus();
        } else {
          setQuotaError({
            type: "generic",
            message:
              message ||
              "An unexpected error occurred while starting the assessment.",
          });
          errorBannerRef.current?.focus();
        }
      } else {
        setQuotaError({
          type: "generic",
          message:
            e instanceof Error
              ? e.message
              : "An unexpected error occurred while starting the assessment.",
        });
        errorBannerRef.current?.focus();
      }
    }
  };

  if (authLoading || usageLoading) {
    return (
      <div className="min-h-screen bg-[#222831] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  const handleAssessmentComplete = (levelPlaced: number) => {
    setPlacementResult(levelPlaced);
    // Clear generation state and session; show results
    genStore.reset();
    resetAssessment();
    setCurrentPhase("results");
  };

  const handleRetakeAssessment = () => {
    setPlacementResult(null);
    setCurrentPhase("intro");
    resetAssessment();
  };

  // Assessment Flow Phase
  if (derivedPhase === "assessment" || genStore.inProgress) {
    return (
      <DashboardLayout
        title="Taking Assessment"
        subtitle="Mark your knowledge level for each word"
      >
        <div className="p-6">
          <AssessmentFlow
            onComplete={handleAssessmentComplete}
            autoStart={currentPhase === "assessment"}
          />
        </div>
      </DashboardLayout>
    );
  }

  // Results Phase
  if (derivedPhase === "results" && placementResult !== null) {
    return (
      <DashboardLayout
        title="Assessment Results"
        subtitle="Your Mandarin proficiency level has been determined"
      >
        <div className="p-6">
          <AssessmentResults
            levelPlaced={placementResult}
            onRetakeAssessment={handleRetakeAssessment}
          />
        </div>
      </DashboardLayout>
    );
  }

  // Introduction Phase (default)
  return (
    <DashboardLayout
      title="Placement Test"
      subtitle="Assess your current Mandarin proficiency level"
    >
      <div className="p-6 space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto">
            <Target className="w-10 h-10 text-blue-400" />
          </div>
          <h2 className="text-2xl font-inter font-bold text-white">
            Discover Your Mandarin Level
          </h2>
          <p className="text-[#a6a6a6] font-inter max-w-2xl mx-auto">
            Take our comprehensive placement test to determine your current
            proficiency level. This will help us create personalized learning
            content just for you.
          </p>
        </div>

        {/* Test Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] text-center">
            <Clock className="w-8 h-8 text-blue-400 mx-auto mb-3" />
            <h3 className="font-inter font-semibold text-white mb-2">
              15-20 Minutes
            </h3>
            <p className="text-[#a6a6a6] text-sm font-inter">
              Average completion time
            </p>
          </div>

          <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] text-center">
            <Target className="w-8 h-8 text-green-400 mx-auto mb-3" />
            <h3 className="font-inter font-semibold text-white mb-2">
              HSK 1-7+ Levels
            </h3>
            <p className="text-[#a6a6a6] text-sm font-inter">
              Comprehensive level assessment
            </p>
          </div>

          <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] text-center">
            <CheckCircle className="w-8 h-8 text-purple-400 mx-auto mb-3" />
            <h3 className="font-inter font-semibold text-white mb-2">
              Instant Results
            </h3>
            <p className="text-[#a6a6a6] text-sm font-inter">
              Get your level immediately
            </p>
          </div>
        </div>

        {/* Assessment Info */}
        <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] max-w-4xl mx-auto">
          <h3 className="text-lg font-inter font-semibold text-white mb-4">
            What to Expect
          </h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">1</span>
              </div>
              <div>
                <h4 className="font-inter font-medium text-white">
                  Read Chinese Passages
                </h4>
                <p className="text-[#a6a6a6] text-sm font-inter">
                  Read 4 different Chinese passages with varying difficulty
                  levels
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">2</span>
              </div>
              <div>
                <h4 className="font-inter font-medium text-white">
                  Mark Word Knowledge
                </h4>
                <p className="text-[#a6a6a6] text-sm font-inter">
                  Click on words to mark them as Known, Partial, or Unknown
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">3</span>
              </div>
              <div>
                <h4 className="font-inter font-medium text-white">
                  Get Your Level
                </h4>
                <p className="text-[#a6a6a6] text-sm font-inter">
                  Receive your HSK level placement with personalized
                  recommendations
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quota Banner - Show when quota exceeded or when there's an error */}
        {(isQuotaExceeded || activeQuotaError) && (
          <div className="max-w-4xl mx-auto">
            <AssessmentQuotaBanner
              ref={errorBannerRef}
              error={
                activeQuotaError ||
                (isQuotaExceeded
                  ? {
                      type: "quota_exceeded" as const,
                      message:
                        "You've reached your assessment limit for this period.",
                      resource: "assessment_taken",
                      planCap: assessmentUsage?.cap,
                      used: assessmentUsage?.used,
                    }
                  : null)
              }
              starting={assessmentLoading}
              isQuotaExceeded={isQuotaExceeded}
              onRetry={handleStartAssessment}
              onDismiss={() => {
                // Only allow dismissal for rate limit or generic errors
                // Don't dismiss when quota is actually exceeded
                if (
                  activeQuotaError &&
                  activeQuotaError.type !== "quota_exceeded" &&
                  !isQuotaExceeded
                ) {
                  setQuotaError(null);
                }
              }}
            />
          </div>
        )}

        {/* Start Assessment */}
        <div className="text-center">
          {isQuotaExceeded ? (
            <Tooltip content={resetDateText}>
              <button
                disabled
                className="inline-flex items-center gap-2 px-8 py-4 bg-[#404040] text-[#a6a6a6] font-inter font-semibold rounded-xl transition-all duration-200 cursor-not-allowed opacity-60 min-h-[44px]"
                aria-label={`Start Placement Test (disabled: ${resetDateText})`}
              >
                Start Placement Test
                <ArrowRight className="w-5 h-5" />
              </button>
            </Tooltip>
          ) : (
            <button
              onClick={handleStartAssessment}
              disabled={assessmentLoading}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#4040f2] to-[#6366f1] hover:from-[#3636d9] hover:to-[#5855f0] text-white font-inter font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              aria-label="Start Placement Test"
            >
              {assessmentLoading ? (
                <>
                  Starting...
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                </>
              ) : (
                <>
                  Start Placement Test
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          )}
          <p className="text-[#a6a6a6] text-sm font-inter mt-3">
            {isQuotaExceeded
              ? `You've reached your assessment limit. ${resetDateText}.`
              : "You can retake this test anytime to track your progress"}
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 max-w-4xl mx-auto">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center mt-0.5">
              <Target className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h4 className="font-inter font-medium text-blue-200 mb-1">
                How the Assessment Works
              </h4>
              <p className="text-blue-300 font-inter text-sm">
                You&apos;ll be shown Chinese passages with clickable words.
                Simply click on any word to indicate whether you know it well
                (Known), recognize it but aren&apos;t sure (Partial), or
                don&apos;t know it at all (Unknown). Our AI will analyze your
                responses to determine your proficiency level.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
