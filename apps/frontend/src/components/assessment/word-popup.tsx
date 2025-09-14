"use client";

import React, { useEffect, useRef } from "react";
import { AlertTriangle, HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WordStatus } from "@/lib/types/assessment";

interface WordPopupProps {
  isOpen: boolean;
  onClose: () => void;
  word: string;
  pinyin?: string;
  definition?: string;
  currentStatus?: WordStatus;
  onStatusSelect: (status: WordStatus | null) => void; // null = remove marking (back to known)
  position: { x: number; y: number };
}

export const WordPopup: React.FC<WordPopupProps> = ({
  isOpen,
  onClose,
  word,
  pinyin,
  definition,
  currentStatus,
  onStatusSelect,
  position,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleStatusSelect = (status: WordStatus | null) => {
    onStatusSelect(status);
    onClose();
  };

  // Calculate popup position to avoid going off screen
  const popupStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.max(10, Math.min(position.x - 100, window.innerWidth - 220)), // Keep popup on screen
    top: Math.max(10, position.y - 120), // Position above the clicked word
    zIndex: 1000,
  };

  return (
    <div
      ref={popupRef}
      style={popupStyle}
      className="bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-52 animate-in fade-in-0 zoom-in-95 duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white text-lg truncate">{word}</div>
          {pinyin && (
            <div className="text-[#4040f2] text-sm font-medium truncate">
              {pinyin}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-2 p-1 hover:bg-[#404040] rounded transition-colors duration-200 flex-shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4 text-[#a6a6a6]" />
        </button>
      </div>

      {/* Definition */}
      {definition && (
        <div className="text-xs text-[#a6a6a6] mb-4 border-b border-[#404040] pb-3">
          {definition}
        </div>
      )}

      {/* Status Options */}
      <div className="space-y-2">
        {/* Partial Button */}
        <button
          onClick={() => handleStatusSelect("partial")}
          className={cn(
            "w-full flex items-center gap-2 p-2 rounded-lg border transition-all duration-200 text-sm cursor-pointer",
            currentStatus === "partial"
              ? "bg-yellow-500/20 border-yellow-500 text-yellow-400"
              : "border-[#404040] text-[#a6a6a6] hover:border-yellow-500/50 hover:bg-yellow-500/10 hover:text-yellow-400"
          )}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">Partial</span>
        </button>

        {/* Unknown Button */}
        <button
          onClick={() => handleStatusSelect("unknown")}
          className={cn(
            "w-full flex items-center gap-2 p-2 rounded-lg border transition-all duration-200 text-sm cursor-pointer",
            currentStatus === "unknown"
              ? "bg-red-500/20 border-red-500 text-red-400"
              : "border-[#404040] text-[#a6a6a6] hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400"
          )}
        >
          <HelpCircle className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">Unknown</span>
        </button>

        {/* Remove Marking (back to Known) */}
        {currentStatus && (
          <button
            onClick={() => handleStatusSelect(null)}
            className="w-full text-center text-xs text-[#999999] hover:text-[#a6a6a6] py-1 transition-colors duration-200 cursor-pointer"
          >
            Remove marking (Known)
          </button>
        )}
      </div>

      {/* Help Text */}
      <div className="text-xs text-[#666666] text-center mt-3 pt-2 border-t border-[#404040]">
        {!currentStatus
          ? "Mark if you don't know this word well"
          : "Click to change or remove"}
      </div>
    </div>
  );
};
