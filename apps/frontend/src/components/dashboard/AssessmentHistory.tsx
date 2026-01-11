"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Target } from "lucide-react";
import { assessmentApi } from "@/lib/api/assessment";

type AssessmentHistoryItem = {
  id: number;
  levelPlaced: number;
  takenAt: string;
};

interface AssessmentHistoryProps {
  initialHistory: AssessmentHistoryItem[];
}

export default function AssessmentHistory({
  initialHistory,
}: AssessmentHistoryProps) {
  const [history, setHistory] = useState(initialHistory);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(5);
  const [isPending, startTransition] = useTransition();

  // Use a deterministic, timezone-stable formatter to avoid SSR/CSR mismatch
  const formatDateUTC = (iso: string) => {
    try {
      const date = new Date(iso);
      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "UTC",
      }).format(date);
    } catch {
      return iso;
    }
  };

  const handleRefresh = () => {
    startTransition(async () => {
      setHistoryError(null);
      try {
        const data = await assessmentApi.getHistory();
        setHistory(data);
        setVisibleHistoryCount(5);
      } catch (error) {
        setHistoryError(
          error instanceof Error
            ? error.message
            : "Failed to load assessment history"
        );
      }
    });
  };

  return (
    <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-inter font-semibold text-white">
          Assessment History
        </h3>
        <button
          onClick={handleRefresh}
          className="p-2 hover:bg-[#404040] rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refresh history"
          aria-label="Refresh assessment history"
          disabled={isPending}
        >
          <RefreshCw
            className={`w-4 h-4 text-[#a6a6a6] ${isPending ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {isPending && !historyError && (
        <div className="flex items-center gap-2 text-[#a6a6a6]">
          <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <span className="font-inter text-sm">Loading...</span>
        </div>
      )}

      {historyError ? (
        <p className="text-red-400 font-inter text-sm">{historyError}</p>
      ) : history.length === 0 ? (
        <p className="text-[#c4c4c4] font-inter text-sm">
          No assessments yet. Take a placement test to get started.
        </p>
      ) : (
        <div className="space-y-3">
          {history.slice(0, visibleHistoryCount).map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between bg-[#24262b] rounded-lg p-3 border border-[#3a3a3a]"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500/20 rounded-md flex items-center justify-center">
                  <Target className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-white font-inter text-sm">Level Placed</p>
                  <p
                    className="text-[#c4c4c4] font-inter text-xs"
                    suppressHydrationWarning
                  >
                    {formatDateUTC(item.takenAt)}
                  </p>
                </div>
              </div>
              <div className="text-white font-inter font-semibold">
                {item.levelPlaced === 0 ? "Novice" : `HSK ${item.levelPlaced}`}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-[#c4c4c4] font-inter">
              Showing {Math.min(visibleHistoryCount, history.length)} of{" "}
              {history.length}
            </span>
            <div className="flex items-center gap-2">
              {visibleHistoryCount > 5 && (
                <button
                  onClick={() => setVisibleHistoryCount(5)}
                  className="px-3 py-1.5 text-xs bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#6b7280] transition-colors duration-200 cursor-pointer"
                >
                  Show less
                </button>
              )}
              {visibleHistoryCount < history.length && (
                <button
                  onClick={() =>
                    setVisibleHistoryCount((count) =>
                      Math.min(count + 5, history.length)
                    )
                  }
                  className="px-3 py-1.5 text-xs bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#6b7280] transition-colors duration-200 cursor-pointer"
                >
                  Show more
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
