"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Trophy, Target, BookOpen, TrendingUp, ArrowRight } from "lucide-react";

interface AssessmentResultsProps {
  levelPlaced: number;
  onRetakeAssessment: () => void;
}

const HSK_LEVEL_INFO = {
  1: {
    name: "HSK Level 1 - Beginner",
    description: "You can understand basic Chinese expressions and characters.",
    vocabulary: "150 words",
    color: "from-blue-500 to-blue-600",
    recommendations: [
      "Start with basic Chinese characters",
      "Practice simple greetings and introductions",
      "Learn numbers and basic time expressions",
    ],
  },
  2: {
    name: "HSK Level 2 - Elementary",
    description: "You can communicate in simple daily situations.",
    vocabulary: "300 words",
    color: "from-green-500 to-green-600",
    recommendations: [
      "Expand vocabulary for daily activities",
      "Practice basic sentence patterns",
      "Learn to express past and future actions",
    ],
  },
  3: {
    name: "HSK Level 3 - Intermediate",
    description: "You can handle most daily communication tasks.",
    vocabulary: "600 words",
    color: "from-yellow-500 to-yellow-600",
    recommendations: [
      "Focus on complex sentence structures",
      "Practice reading longer texts",
      "Learn to express opinions and preferences",
    ],
  },
  4: {
    name: "HSK Level 4 - Upper Intermediate",
    description: "You can discuss a wide range of topics fluently.",
    vocabulary: "1,200 words",
    color: "from-orange-500 to-orange-600",
    recommendations: [
      "Read Chinese news and articles",
      "Practice formal and informal speech",
      "Learn advanced grammar patterns",
    ],
  },
  5: {
    name: "HSK Level 5 - Advanced",
    description: "You can read Chinese magazines and watch Chinese films.",
    vocabulary: "2,500 words",
    color: "from-red-500 to-red-600",
    recommendations: [
      "Engage with authentic Chinese media",
      "Practice academic and professional Chinese",
      "Focus on idiomatic expressions",
    ],
  },
  6: {
    name: "HSK Level 6 - Proficient",
    description: "You can easily comprehend written and spoken Chinese.",
    vocabulary: "5,000+ words",
    color: "from-purple-500 to-purple-600",
    recommendations: [
      "Master complex literary texts",
      "Perfect your pronunciation and tones",
      "Prepare for native-level communication",
    ],
  },
  7: {
    name: "HSK Level 7+ - Native-like",
    description: "You have native-like proficiency in Chinese.",
    vocabulary: "8,000+ words",
    color: "from-indigo-500 to-indigo-600",
    recommendations: [
      "Engage in academic discussions",
      "Read classical Chinese literature",
      "Consider teaching or professional translation",
    ],
  },
};

export const AssessmentResults: React.FC<AssessmentResultsProps> = ({
  levelPlaced,
  onRetakeAssessment,
}) => {
  const router = useRouter();
  const levelInfo =
    HSK_LEVEL_INFO[levelPlaced as keyof typeof HSK_LEVEL_INFO] ||
    HSK_LEVEL_INFO[1];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Celebration Header */}
      <div className="text-center space-y-4">
        <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto animate-bounce">
          <Trophy className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-inter font-bold text-white">
          Assessment Complete!
        </h1>
        <p className="text-[#a6a6a6] font-inter">
          Congratulations on completing your Mandarin placement test
        </p>
      </div>

      {/* Level Result */}
      <div
        className={`bg-gradient-to-r ${levelInfo.color} rounded-2xl p-8 text-white text-center`}
      >
        <div className="space-y-4">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto">
            <Target className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-inter font-bold">
            Your Level: {levelInfo.name}
          </h2>
          <p className="text-lg font-inter opacity-90">
            {levelInfo.description}
          </p>
          <div className="inline-block bg-white/20 px-4 py-2 rounded-full">
            <span className="font-inter font-medium">
              Vocabulary: {levelInfo.vocabulary}
            </span>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
        <div className="flex items-center gap-3 mb-4">
          <BookOpen className="w-6 h-6 text-[#4040f2]" />
          <h3 className="text-xl font-inter font-semibold text-white">
            Recommended Next Steps
          </h3>
        </div>
        <div className="space-y-3">
          {levelInfo.recommendations.map((recommendation, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="w-6 h-6 bg-[#4040f2] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">
                  {index + 1}
                </span>
              </div>
              <p className="text-[#a6a6a6] font-inter">{recommendation}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Start Learning */}
        <div
          className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] hover:border-[#4040f2] transition-all duration-200 cursor-pointer group"
          onClick={() => router.push("/lessons")}
        >
          <div className="space-y-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center group-hover:bg-green-500/30 transition-colors duration-200">
              <BookOpen className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h4 className="font-inter font-semibold text-white mb-2">
                Start AI Lessons
              </h4>
              <p className="text-sm text-[#a6a6a6] font-inter mb-4">
                Begin personalized lessons tailored to your HSK {levelPlaced}{" "}
                level
              </p>
              <div className="flex items-center gap-2 text-sm text-green-400 font-inter">
                <span>Available</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        {/* Track Progress */}
        <div
          className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] hover:border-[#4040f2] transition-all duration-200 cursor-pointer group"
          onClick={() => router.push("/progress")}
        >
          <div className="space-y-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center group-hover:bg-blue-500/30 transition-colors duration-200">
              <TrendingUp className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h4 className="font-inter font-semibold text-white mb-2">
                Track Progress
              </h4>
              <p className="text-sm text-[#a6a6a6] font-inter mb-4">
                Monitor your learning journey and see improvement over time
              </p>
              <div className="flex items-center gap-2 text-sm text-blue-400 font-inter">
                <span>Coming Soon</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <button
          onClick={() => {
            router.push("/dashboard");
          }}
          className="px-8 py-3 bg-[#4040f2] hover:bg-[#3636d9] text-white font-inter font-semibold rounded-xl transition-colors duration-200 shadow-lg shadow-blue-500/20 cursor-pointer"
        >
          Go to Dashboard
        </button>

        <button
          onClick={onRetakeAssessment}
          className="px-6 py-3 bg-[#2e323a] hover:bg-[#404040] text-white font-inter font-medium rounded-xl border border-[#404040] transition-colors duration-200 cursor-pointer"
        >
          Retake Assessment
        </button>
      </div>

      {/* Note */}
      <div className="text-center">
        <p className="text-sm text-[#999999] font-inter">
          You can retake this assessment anytime to track your progress.
        </p>
      </div>
    </div>
  );
};
