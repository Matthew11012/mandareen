"use client";

import {
  Target,
  TrendingUp,
  Clock,
  Flame,
  Check,
  Calendar,
} from "lucide-react";
import CountUp from "@/components/ui/CountUp";

interface QuickStatsProps {
  currentLevel: number | null;
  wordsLearned: number;
  studyStreakDays: number;
  streakTodayContinued: boolean;
  streakCarryOverDays: number;
}

export default function QuickStats({
  currentLevel,
  wordsLearned,
  studyStreakDays,
  streakTodayContinued,
  streakCarryOverDays,
}: QuickStatsProps) {
  const displayedLevel = (() => {
    if (currentLevel === null) return "Not Assessed";
    if (currentLevel === 0) return "Below HSK 1";
    return `HSK ${currentLevel}`;
  })();

  const levelColorClass = (() => {
    if (currentLevel === null || currentLevel === 0) return "text-[#a6a6a6]";
    if (currentLevel <= 2) return "text-yellow-400";
    if (currentLevel <= 4) return "text-green-400";
    return "text-blue-400";
  })();
  const displayedStreakDays = streakTodayContinued
    ? studyStreakDays
    : Math.max(streakCarryOverDays, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center"
              title="Your current HSK level"
            >
              <Target className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-[#c4c4c4] text-sm font-inter">Current Level</p>
              <span
                className={`inline-flex items-center rounded-full text-xl ${levelColorClass}`}
              >
                {displayedLevel}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center"
            title="Total words you've read"
          >
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-[#c4c4c4] text-sm font-inter">Words Read</p>
            <p
              className="text-white text-xl font-inter font-semibold transition-all duration-300"
              aria-live="polite"
              key={wordsLearned}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              <CountUp
                from={0}
                to={wordsLearned}
                separator=","
                direction="up"
                duration={1}
              />
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center"
            title="Consecutive days of study"
          >
            <Clock className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[#c4c4c4] text-sm font-inter">Study Streak</p>
              {streakTodayContinued && (
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-500/15 border border-green-500/30 text-green-200"
                  title="Today's streak continued"
                  aria-label="Today's streak continued"
                >
                  <Check className="w-3.5 h-3.5" />
                </span>
              )}
              {!streakTodayContinued && streakCarryOverDays > 0 && (
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-200"
                  title={`You're on a ${streakCarryOverDays}-day streak. Study today to reach ${streakCarryOverDays + 1}!`}
                  aria-label={`You're on a ${streakCarryOverDays}-day streak. Study today to reach ${streakCarryOverDays + 1}!`}
                >
                  <Flame className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
            <div>
              <p
                className="text-white text-xl font-inter font-semibold transition-all duration-300"
                aria-live="polite"
                key={`streak-${streakTodayContinued}-${studyStreakDays}-${streakCarryOverDays}`}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                <CountUp
                  from={0}
                  to={displayedStreakDays}
                  separator=","
                  direction="up"
                  duration={1}
                />{" "}
                {displayedStreakDays === 1 ? "day" : "days"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
            <Calendar className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <p className="text-[#c4c4c4] text-sm font-inter">Weekly Goal</p>
            <p
              className="text-white text-xl font-inter font-semibold"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              <CountUp
                from={0}
                to={5}
                separator=","
                direction="up"
                duration={1}
              />{" "}
              lessons
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
