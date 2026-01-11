"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout";
import { useRequireAuth, useAuth } from "@/lib/hooks/use-auth";
import { authApi, type MeResponse } from "@/lib/api/auth";
import {
  RefreshCw,
  User,
  Target,
  Minus,
  Plus,
  Save,
  X,
  Bell,
  BellOff,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { getHSKPillClasses } from "@/lib/constants/hsk";
import {
  subscribeToPush,
  unsubscribeFromPush,
  isPushSupported,
} from "@/lib/push";
import { toast } from "sonner";

export default function ProfilePage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { setUser } = useAuth() as {
    setUser?: (user: Partial<MeResponse>) => void;
  };

  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weeklyGoalValue, setWeeklyGoalValue] = useState<number | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [pushSupported, setPushSupported] = useState<boolean | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState<boolean | null>(null);
  const [pushToggling, setPushToggling] = useState(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [usernameValue, setUsernameValue] = useState<string>("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const trimmedUsername = usernameValue.trim();
  const canSaveUsername =
    !savingUsername &&
    trimmedUsername.length >= 3 &&
    trimmedUsername.length <= 30 &&
    trimmedUsername !== data?.username;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await authApi.me();
      setData(me);
      setWeeklyGoalValue(me.weeklyGoalLessons);
      setUsernameValue(me.username);
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

  const checkPushStatus = async () => {
    const supported = await isPushSupported();
    setPushSupported(supported);
    if (
      supported &&
      typeof window !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setPushSubscribed(!!sub);
      } catch {
        setPushSubscribed(false);
      }
    } else {
      setPushSubscribed(false);
    }
  };

  const saveUsername = async () => {
    if (!usernameValue.trim() || usernameValue === data?.username) {
      setIsEditingUsername(false);
      setUsernameError(null);
      return;
    }

    setSavingUsername(true);
    setUsernameError(null);
    try {
      const result = await authApi.updateUsername(usernameValue.trim());
      setData((prev) => (prev ? { ...prev, username: result.username } : null));
      setUser?.({ username: result.username });
      setIsEditingUsername(false);
      toast.success("Username updated!");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update username";
      if (msg.toLowerCase().includes("taken") || msg.includes("409")) {
        setUsernameError("Username already taken");
      } else {
        setUsernameError(msg);
      }
    } finally {
      setSavingUsername(false);
    }
  };

  const handlePushToggle = async () => {
    if (!pushSupported) {
      toast.error("Push notifications are not supported in this browser");
      return;
    }

    setPushToggling(true);
    try {
      if (pushSubscribed) {
        await unsubscribeFromPush();
        setPushSubscribed(false);
        toast.success("Push notifications disabled");
      } else {
        // subscribeToPush now throws instead of returning null
        await subscribeToPush();
        setPushSubscribed(true);
        toast.success(
          "Push notifications enabled! You'll be notified when lessons are ready."
        );
      }
    } catch (err) {
      console.error("Push toggle error:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to toggle push notifications";
      toast.error(msg);
      // Refresh status on error
      checkPushStatus();
    } finally {
      setPushToggling(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      load();
      checkPushStatus();
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
                <p className="text-[#a6a6a6] text-sm font-inter">Username</p>
                {isEditingUsername ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
                      <input
                        type="text"
                        value={usernameValue}
                        onChange={(e) => {
                          const next = e.target.value;
                          setUsernameValue(
                            next.length > 30 ? next.slice(0, 30) : next
                          );
                        }}
                        className="w-full sm:flex-1 px-2 py-2 bg-[#2e323a] border border-[#3a3a3a] rounded text-white font-inter text-sm"
                        placeholder="Enter username"
                        autoFocus
                        maxLength={30}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveUsername();
                          }
                          if (e.key === "Escape") {
                            setIsEditingUsername(false);
                            setUsernameValue(data.username);
                            setUsernameError(null);
                          }
                        }}
                      />
                      <div className="flex w-full sm:w-auto gap-2">
                        <button
                          onClick={saveUsername}
                          disabled={!canSaveUsername}
                          className="flex-1 sm:flex-none px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded disabled:opacity-50 cursor-pointer text-center"
                        >
                          {savingUsername ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingUsername(false);
                            setUsernameValue(data.username);
                            setUsernameError(null);
                          }}
                          className="flex-1 sm:flex-none px-3 py-2 bg-[#404040] hover:bg-[#505050] text-white text-xs rounded cursor-pointer text-center"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between text-[#a6a6a6] text-xs mt-1 gap-1">
                      <p>3–30 characters</p>
                      <p className="text-right" aria-live="polite">
                        {trimmedUsername.length}/30
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-white font-inter">{data.username}</p>
                    <button
                      onClick={() => setIsEditingUsername(true)}
                      className="text-blue-400 hover:text-blue-300 text-xs font-inter cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                )}
                {usernameError && (
                  <p className="text-red-400 text-xs mt-1" aria-live="polite">
                    {usernameError}
                  </p>
                )}
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
                    {data.currentLevel === 0
                      ? "Novice"
                      : `HSK ${data.currentLevel}`}
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
          className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
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
            <div className="flex items-center justify-center gap-3">
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

              <div className="w-32 sm:w-40">
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

            <div className="flex flex-col sm:flex-row-reverse sm:justify-between gap-2">
              <button
                onClick={saveWeeklyGoal}
                disabled={
                  savingGoal || weeklyGoalValue === data?.weeklyGoalLessons
                }
                className="w-full sm:flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-inter rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {savingGoal ? "Saving..." : "Save"}
              </button>

              {data?.weeklyGoalLessons !== null && (
                <button
                  onClick={clearWeeklyGoal}
                  disabled={savingGoal}
                  className="w-full sm:flex-1 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 text-sm font-inter rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 cursor-pointer"
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

        {/* Push Notifications Section */}
        <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
              {pushSubscribed ? (
                <Bell className="w-5 h-5 text-blue-400" />
              ) : (
                <BellOff className="w-5 h-5 text-[#a6a6a6]" />
              )}
            </div>
            <div>
              <h3 className="text-white font-inter font-semibold">
                Push Notifications
              </h3>
              <p className="text-[#a6a6a6] font-inter text-sm">
                Get notified when your AI-generated lessons are ready
              </p>
            </div>
          </div>

          {pushSupported === false ? (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-yellow-400 font-inter text-sm">
                Push notifications are not supported in this browser or device.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status and Toggle - Stack on mobile */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1">
                  <p className="text-white font-inter font-medium">
                    {pushSubscribed ? "Enabled" : "Disabled"}
                  </p>
                  <p className="text-[#a6a6a6] font-inter text-xs mt-1">
                    {pushSubscribed
                      ? "You'll receive notifications when lessons are generated."
                      : "Enable to receive notifications when lessons are ready."}
                  </p>
                </div>
                <button
                  onClick={handlePushToggle}
                  disabled={pushToggling || pushSupported === null}
                  className={`w-full sm:w-auto px-4 py-2 text-sm font-inter rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    pushSubscribed
                      ? "bg-red-500/20 hover:bg-red-500/30 text-red-400"
                      : "bg-blue-500 hover:bg-blue-600 text-white"
                  }`}
                >
                  {pushToggling ? (
                    <>
                      <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      {pushSubscribed ? "Disabling..." : "Enabling..."}
                    </>
                  ) : pushSubscribed ? (
                    <>
                      <BellOff className="w-4 h-4" />
                      Disable
                    </>
                  ) : (
                    <>
                      <Bell className="w-4 h-4" />
                      Enable
                    </>
                  )}
                </button>
              </div>

              {/* Cross-device note - subtle info */}
              <div className="flex items-center gap-2 p-2 bg-[#24262b]/50 rounded-lg">
                <Info className="w-4 h-4 text-[#6b7280] shrink-0" />
                <p className="text-[#6b7280] font-inter text-xs">
                  Each browser/device needs its own subscription. Enabling here
                  won&apos;t affect other browsers or devices.
                </p>
              </div>

              {/* VAPID key warning */}
              {!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-yellow-400 font-inter text-xs">
                    Note: Push notifications require VAPID keys to be
                    configured.
                  </p>
                </div>
              )}

              {/* Collapsible Troubleshooting Section */}
              <div className="border border-[#3a3a3a] rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowTroubleshooting(!showTroubleshooting)}
                  className="w-full p-3 bg-[#24262b] hover:bg-[#2a2c32] transition-colors duration-200 flex items-center justify-between cursor-pointer"
                  aria-expanded={showTroubleshooting}
                >
                  <span className="text-[#a6a6a6] font-inter text-xs font-medium">
                    Having trouble enabling notifications?
                  </span>
                  {showTroubleshooting ? (
                    <ChevronUp className="w-4 h-4 text-[#a6a6a6]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#a6a6a6]" />
                  )}
                </button>
                {showTroubleshooting && (
                  <div className="p-3 bg-[#24262b] border-t border-[#3a3a3a]">
                    <p className="text-[#a6a6a6] font-inter text-xs mb-3">
                      If enabling fails, browsers or extensions may block push
                      services (like Google FCM). Try:
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-[#6b7280] font-inter text-xs mt-0.5">
                          •
                        </span>
                        <p className="text-[#a6a6a6] font-inter text-xs flex-1">
                          Allow notifications for this site in your browser
                          settings
                        </p>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#6b7280] font-inter text-xs mt-0.5">
                          •
                        </span>
                        <p className="text-[#a6a6a6] font-inter text-xs flex-1">
                          Temporarily disable ad blockers, VPNs, or firewalls
                          that may block{" "}
                          <code className="text-[#6b7280]">
                            fcm.googleapis.com
                          </code>
                        </p>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#6b7280] font-inter text-xs mt-0.5">
                          •
                        </span>
                        <div className="flex-1">
                          <p className="text-[#a6a6a6] font-inter text-xs">
                            <strong className="text-[#9ca3af]">
                              Brave Browser:
                            </strong>{" "}
                            Enable &quot;Use Google services for push
                            messaging&quot; in Privacy &amp; security settings
                          </p>
                        </div>
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
