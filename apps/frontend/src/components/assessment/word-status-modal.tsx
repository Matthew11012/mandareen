"use client";

import React from "react";
import { X, Check, AlertTriangle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WordStatus } from "@/lib/types/assessment";

interface WordStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  word: string;
  pinyin?: string;
  definition?: string;
  currentStatus?: WordStatus;
  onStatusSelect: (status: WordStatus) => void;
}

const statusOptions = [
  {
    value: "known" as WordStatus,
    label: "Known",
    icon: Check,
    color: "bg-green-500",
    hoverColor: "hover:bg-green-600",
    description: "I know this word well",
  },
  {
    value: "partial" as WordStatus,
    label: "Partial",
    icon: AlertTriangle,
    color: "bg-yellow-500",
    hoverColor: "hover:bg-yellow-600",
    description: "I recognize it but not sure",
  },
  {
    value: "unknown" as WordStatus,
    label: "Unknown",
    icon: HelpCircle,
    color: "bg-red-500",
    hoverColor: "hover:bg-red-600",
    description: "I don't know this word",
  },
];

export const WordStatusModal: React.FC<WordStatusModalProps> = ({
  isOpen,
  onClose,
  word,
  pinyin,
  definition,
  currentStatus,
  onStatusSelect,
}) => {
  if (!isOpen) return null;

  const handleStatusSelect = (status: WordStatus) => {
    onStatusSelect(status);
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
    >
      <div className="bg-[#2e323a] rounded-2xl p-6 w-full max-w-md border border-[#404040] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-inter font-semibold text-white">
            Mark Word Knowledge
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#404040] rounded-lg transition-colors duration-200"
          >
            <X className="w-5 h-5 text-[#a6a6a6]" />
          </button>
        </div>

        {/* Word Display */}
        <div className="text-center mb-6 p-4 bg-[#1a1d23] rounded-xl border border-[#404040]">
          <div className="text-3xl font-bold text-white mb-2">{word}</div>
          {pinyin && (
            <div className="text-lg text-[#4040f2] font-medium mb-1">
              {pinyin}
            </div>
          )}
          {definition && (
            <div className="text-sm text-[#a6a6a6] font-inter">
              {definition}
            </div>
          )}
        </div>

        {/* Status Options */}
        <div className="space-y-3">
          <p className="text-sm text-[#a6a6a6] font-inter text-center mb-4">
            How well do you know this word?
          </p>

          {statusOptions.map((option) => {
            const IconComponent = option.icon;
            const isSelected = currentStatus === option.value;

            return (
              <button
                key={option.value}
                onClick={() => handleStatusSelect(option.value)}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200",
                  isSelected
                    ? `${option.color} border-current text-white`
                    : `border-[#404040] hover:border-[#4040f2] text-[#a6a6a6] hover:text-white hover:bg-[#404040]/50`
                )}
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center",
                    isSelected
                      ? "bg-white/20"
                      : "bg-[#404040] group-hover:bg-[#4040f2]/20"
                  )}
                >
                  <IconComponent
                    className={cn(
                      "w-5 h-5",
                      isSelected ? "text-white" : "text-[#a6a6a6]"
                    )}
                  />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-inter font-medium text-lg">
                    {option.label}
                  </div>
                  <div
                    className={cn(
                      "text-sm font-inter",
                      isSelected ? "text-white/80" : "text-[#999999]"
                    )}
                  >
                    {option.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Remove Option */}
        {currentStatus && (
          <div className="mt-6 pt-4 border-t border-[#404040]">
            <button
              onClick={() => {
                onStatusSelect(currentStatus); // This will remove it via the parent logic
                onClose();
              }}
              className="w-full text-center text-sm text-[#999999] hover:text-[#a6a6a6] font-inter transition-colors duration-200"
            >
              Remove marking
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
