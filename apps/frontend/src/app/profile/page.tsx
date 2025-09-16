"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import { authApi, type MeResponse } from "@/lib/api/auth";
import { RefreshCw, User } from "lucide-react";
import { getHSKPillClasses } from "@/lib/constants/hsk";

export default function ProfilePage() {
  const { isLoading: authLoading } = useRequireAuth();

  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await authApi.me();
      setData(me);
    } catch {
      setError("Failed to load profile");
    } finally {
      setLoading(false);
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
      </div>
    </DashboardLayout>
  );
}
