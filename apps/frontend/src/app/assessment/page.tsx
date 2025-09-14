"use client";

import { useRequireAuth } from "@/lib/hooks/use-auth";
import { DashboardLayout } from "@/components/layout";
import { Target, Clock, CheckCircle } from "lucide-react";

/**
 * Assessment Page (Protected Route)
 *
 * Placement test page where users can assess their Mandarin proficiency level.
 */
export default function AssessmentPage() {
  const { isLoading } = useRequireAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#222831] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

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
                  Vocabulary Recognition
                </h4>
                <p className="text-[#a6a6a6] text-sm font-inter">
                  Mark Chinese words as Unknown, Partial, or Known
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">2</span>
              </div>
              <div>
                <h4 className="font-inter font-medium text-white">
                  Reading Comprehension
                </h4>
                <p className="text-[#a6a6a6] text-sm font-inter">
                  Read passages and answer multiple choice questions
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">3</span>
              </div>
              <div>
                <h4 className="font-inter font-medium text-white">
                  Grammar & Context
                </h4>
                <p className="text-[#a6a6a6] text-sm font-inter">
                  Fill in blanks and demonstrate understanding
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Start Assessment */}
        <div className="text-center">
          <button className="px-8 py-4 bg-gradient-to-r from-[#4040f2] to-[#6366f1] hover:from-[#3636d9] hover:to-[#5855f0] text-white font-inter font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-500/20">
            Start Placement Test
          </button>
          <p className="text-[#a6a6a6] text-sm font-inter mt-3">
            You can retake this test anytime to track your progress
          </p>
        </div>

        {/* Coming Soon Notice */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-yellow-500/20 rounded-full flex items-center justify-center">
              <Clock className="w-4 h-4 text-yellow-400" />
            </div>
            <p className="text-yellow-200 font-inter text-sm">
              <strong>Under Development:</strong> The assessment interface is
              currently being built. The backend functionality is ready and will
              be connected soon.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
