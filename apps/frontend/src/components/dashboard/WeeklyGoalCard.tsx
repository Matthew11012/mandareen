"use client";

import {
  Target,
  CheckCircle,
  AlertCircle,
  Calendar,
  TrendingUp,
} from "lucide-react";
import CountUp from "@/components/ui/CountUp";

interface WeeklyGoalCardProps {
  weeklyCount: number;
  goal: number;
  weekStart: string;
  weekEnd: string;
}

export default function WeeklyGoalCard({
  weeklyCount,
  goal,
  weekStart,
  weekEnd,
}: WeeklyGoalCardProps) {
  const progress = Math.min(weeklyCount / goal, 1);
  const remaining = Math.max(goal - weeklyCount, 0);
  const isReached = weeklyCount >= goal;
  const isOnTrack = weeklyCount >= goal * 0.7; // 70% threshold for "on track"

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const getStatusColor = () => {
    if (isReached) return "text-green-400";
    if (isOnTrack) return "text-blue-400";
    return "text-amber-400";
  };

  const getStatusIcon = () => {
    if (isReached) return <CheckCircle className="w-5 h-5 text-green-400" />;
    if (isOnTrack) return <TrendingUp className="w-5 h-5 text-blue-400" />;
    return <AlertCircle className="w-5 h-5 text-amber-400" />;
  };

  const getStatusText = () => {
    if (isReached) return "Goal achieved!";
    if (isOnTrack) return "On track";
    return "Keep going";
  };

  const getProgressBarColor = () => {
    if (isReached) return "bg-green-500";
    if (isOnTrack) return "bg-blue-500";
    return "bg-amber-500";
  };

  return (
    <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
            <Target className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <p className="text-[#c4c4c4] text-sm font-inter">Weekly Goal</p>
            <div className="flex items-center gap-2">
              <span
                className={`text-lg font-inter font-semibold ${getStatusColor()}`}
              >
                {getStatusText()}
              </span>
              {getStatusIcon()}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="text-white text-2xl font-inter font-semibold"
              style={{ fontVariantNumeric: "tabular-nums" }}
              aria-live="polite"
            >
              <CountUp
                from={0}
                to={weeklyCount}
                separator=","
                direction="up"
                duration={1}
              />
            </span>
            <span className="text-[#c4c4c4] text-lg font-inter">
              of {goal} lessons
            </span>
          </div>
          {!isReached && (
            <div className="text-left sm:text-right">
              <p className="text-[#c4c4c4] text-sm font-inter">
                {remaining} to go
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-[#a6a6a6] font-inter">
            <span>Progress</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="w-full bg-[#404040] rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${getProgressBarColor()}`}
              style={{ width: `${progress * 100}%` }}
              role="progressbar"
              aria-valuenow={weeklyCount}
              aria-valuemin={0}
              aria-valuemax={goal}
              aria-label={`${weeklyCount} of ${goal} lessons completed`}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#a6a6a6] font-inter">
          <Calendar className="w-3 h-3" />
          <span>
            {formatDate(weekStart)} - {formatDate(weekEnd)}
          </span>
        </div>
      </div>
    </div>
  );
}
