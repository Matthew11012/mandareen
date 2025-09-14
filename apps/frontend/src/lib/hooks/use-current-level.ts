"use client";

import { useState, useEffect } from "react";
import { assessmentApi } from "../api/assessment";

export interface UserLevel {
  currentLevel: number | null;
  isLoading: boolean;
  error: string | null;
}

export const useCurrentLevel = () => {
  const [userLevel, setUserLevel] = useState<UserLevel>({
    currentLevel: null,
    isLoading: true,
    error: null,
  });

  const fetchCurrentLevel = async () => {
    try {
      setUserLevel((prev) => ({ ...prev, isLoading: true, error: null }));
      const result = await assessmentApi.getCurrentLevel();
      setUserLevel({
        currentLevel: result.currentLevel,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error("Error fetching current level:", error);
      setUserLevel({
        currentLevel: null,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch current level",
      });
    }
  };

  const refreshLevel = () => {
    fetchCurrentLevel();
  };

  useEffect(() => {
    fetchCurrentLevel();
  }, []);

  // Listen for global level refresh events
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleLevelRefresh = () => {
      fetchCurrentLevel();
    };

    const LEVEL_REFRESH_EVENT = "level-refresh";
    window.addEventListener(LEVEL_REFRESH_EVENT, handleLevelRefresh);

    return () => {
      window.removeEventListener(LEVEL_REFRESH_EVENT, handleLevelRefresh);
    };
  }, []);

  const formatLevel = (level: number | null): string => {
    if (level === null) return "Not Assessed";
    if (level === 0) return "Below HSK 1";
    return `HSK ${level}`;
  };

  const getLevelColor = (level: number | null): string => {
    if (level === null || level === 0) return "text-[#a6a6a6]";
    if (level <= 2) return "text-yellow-400";
    if (level <= 4) return "text-green-400";
    return "text-blue-400";
  };

  return {
    ...userLevel,
    formatLevel: (level?: number | null) =>
      formatLevel(level ?? userLevel.currentLevel),
    getLevelColor: (level?: number | null) =>
      getLevelColor(level ?? userLevel.currentLevel),
    refreshLevel,
  };
};
