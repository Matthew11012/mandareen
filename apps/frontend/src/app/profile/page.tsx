"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import { authApi, type MeResponse } from "@/lib/api/auth";
import { RefreshCw, User, Target, Minus, Plus, Save, X } from "lucide-react";
import { getHSKPillClasses } from "@/lib/constants/hsk";

export default function ProfilePage() {
  const { isLoading: authLoading } = useRequireAuth();

  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weeklyGoalValue, setWeeklyGoalValue] = useState<number | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await authApi.me();
      setData(me);
      setWeeklyGoalValue(me.weeklyGoalLessons);
    } catch {
      setError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const saveWeeklyGoal = async () => {
    if (weeklyGoalValue === data?.weeklyGoalLessons) return; // No change

    setSavingGoal(true);
    setGoalError(null);
    try {
      await authApi.updateWeeklyGoal(weeklyGoalValue);
      // Update local data optimistically
      setData((prev) =>
        prev ? { ...prev, weeklyGoalLessons: weeklyGoalValue } : null
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to save weekly goal";
      setGoalError(errorMessage);
      // Revert to original value
      setWeeklyGoalValue(data?.weeklyGoalLessons || null);
    } finally {
      setSavingGoal(false);
    }
  };

  const clearWeeklyGoal = async () => {
    setSavingGoal(true);
    setGoalError(null);
    try {
      await authApi.updateWeeklyGoal(null);
      setData((prev) => (prev ? { ...prev, weeklyGoalLessons: null } : null));
      setWeeklyGoalValue(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to clear weekly goal";
      setGoalError(errorMessage);
    } finally {
      setSavingGoal(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      load();
    }
  }, [authLoading]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#222831] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  return (
    <DashboardLayout title="Profile" subtitle="Manage your account information">
      <div className="p-6 space-y-6">
        <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-inter font-semibold">Account</h3>
                <p className="text-[#a6a6a6] font-inter text-sm">
                  Your basic profile info
                </p>
              </div>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="p-2 hover:bg-[#404040] rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh"
            >
              <RefreshCw
                className={`w-4 h-4 text-[#a6a6a6] ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-[#a6a6a6]">
              <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span className="font-inter text-sm">Loading...</span>
            </div>
          ) : error ? (
            <p className="text-red-400 font-inter text-sm">{error}</p>
          ) : data ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#24262b] rounded-lg p-4 border border-[#3a3a3a]">
                <p className="text-[#a6a6a6] text-sm font-inter">Email</p>
                <p className="text-white font-inter">{data.email}</p>
              </div>
              <div className="bg-[#24262b] rounded-lg p-4 border border-[#3a3a3a]">
                <p className="text-[#a6a6a6] text-sm font-inter">
                  Member Since
                </p>
                <p className="text-white font-inter">
                  {new Date(data.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="bg-[#24262b] rounded-lg p-4 border border-[#3a3a3a]">
                <p className="text-[#a6a6a6] text-sm font-inter">
                  Current Level
                </p>
                {data.currentLevel === null ? (
                  <p className="text-white font-inter">—</p>
                ) : (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs mt-1 ${getHSKPillClasses(data.currentLevel)}`}
                  >
                    HSK {data.currentLevel}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[#a6a6a6] font-inter text-sm">No data</p>
          )}
        </div>

        {/* Weekly Goal Section */}
        <div
          id="weekly-goal"
          className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] w-fit max-w-full"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-inter font-semibold">
                Weekly Goal
              </h3>
              <p className="text-[#a6a6a6] font-inter text-sm">
                Set your target number of lessons per week (1-50)
              </p>
            </div>
          </div>

          {goalError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 font-inter text-sm">{goalError}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() =>
                  setWeeklyGoalValue((prev) => Math.max(1, (prev || 1) - 1))
                }
                disabled={savingGoal || weeklyGoalValue === null}
                className="w-10 h-10 bg-[#404040] hover:bg-[#505050] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center justify-center transition-colors duration-200 cursor-pointer"
                aria-label="Decrease goal"
              >
                <Minus className="w-4 h-4 text-white" />
              </button>

              <div className="w-24">
                <input
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  value={weeklyGoalValue || ""}
                  onChange={(e) => {
                    const value =
                      e.target.value === ""
                        ? null
                        : Math.max(
                            1,
                            Math.min(50, parseInt(e.target.value) || 1)
                          );
                    setWeeklyGoalValue(value);
                  }}
                  disabled={savingGoal}
                  inputMode="numeric"
                  className="w-full px-3 py-2 bg-[#24262b] border border-[#3a3a3a] rounded-lg text-white font-inter text-center disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="Set goal"
                  aria-describedby="goal-help"
                />
              </div>

              <button
                onClick={() =>
                  setWeeklyGoalValue((prev) => Math.min(50, (prev || 1) + 1))
                }
                disabled={savingGoal || weeklyGoalValue === null}
                className="w-10 h-10 bg-[#404040] hover:bg-[#505050] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center justify-center transition-colors duration-200 cursor-pointer"
                aria-label="Increase goal"
              >
                <Plus className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="flex items-center gap-2 w-fit">
              <button
                onClick={saveWeeklyGoal}
                disabled={
                  savingGoal || weeklyGoalValue === data?.weeklyGoalLessons
                }
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-inter rounded-lg transition-colors duration-200 flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {savingGoal ? "Saving..." : "Save"}
              </button>

              {data?.weeklyGoalLessons !== null && (
                <button
                  onClick={clearWeeklyGoal}
                  disabled={savingGoal}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 text-sm font-inter rounded-lg transition-colors duration-200 flex items-center gap-2 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>

            <p id="goal-help" className="text-[#a6a6a6] font-inter text-xs">
              Set a weekly target to stay motivated. You can change or clear
              this anytime.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
