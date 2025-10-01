"use client";

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type {
  AssessmentPassage,
  WordResponse,
  WordStatus,
} from "@/lib/types/assessment";
import { WordPopup } from "./word-popup";

interface PassageDisplayProps {
  passage: AssessmentPassage;
  wordResponses: WordResponse[];
  onWordResponse: (response: WordResponse) => void;
  onRemoveWordResponse: (word: string) => void;
  // Multi-select support
  multiSelect?: boolean;
  selectedKeys?: Set<string>;
  onToggleSelect?: (
    key: string,
    word: string,
    startIndex: number,
    endIndex: number
  ) => void;
}

interface ClickableSegment {
  text: string;
  startIndex: number;
  endIndex: number;
  isWord: boolean;
  wordData?: {
    pinyin: string;
    definition: string;
    hskLevel: number;
  };
}

export const PassageDisplay: React.FC<PassageDisplayProps> = ({
  passage,
  wordResponses,
  onWordResponse,
  onRemoveWordResponse,
  multiSelect = false,
  selectedKeys,
  onToggleSelect,
}) => {
  const [popupState, setPopupState] = useState<{
    isOpen: boolean;
    word: string;
    pinyin?: string;
    definition?: string;
    startIndex: number;
    endIndex: number;
    currentStatus?: WordStatus;
    position: { x: number; y: number };
  }>({
    isOpen: false,
    word: "",
    startIndex: 0,
    endIndex: 0,
    position: { x: 0, y: 0 },
  });

  // Create segments from backend tokenization (full coverage), fallback to words scan
  const segments = useMemo<ClickableSegment[]>(() => {
    if (passage.segments && passage.segments.length > 0) {
      return passage.segments.map((s) => ({
        text: s.text,
        startIndex: s.startIndex,
        endIndex: s.endIndex,
        isWord: s.isWord,
        wordData: s.isWord
          ? {
              pinyin: s.pinyin || "",
              definition: s.definition || "",
              hskLevel: s.hskLevel || 0,
            }
          : undefined,
      }));
    }

    // Fallback: approximate using provided words list (legacy)
    const content = passage.content;
    const result: ClickableSegment[] = [];
    let currentIndex = 0;
    const identified: Array<{
      word: string;
      startIndex: number;
      endIndex: number;
      wordData: { pinyin: string; definition: string; hskLevel: number };
    }> = [];

    passage.words.forEach((wordData) => {
      const wordText = wordData.text;
      let searchIndex = 0;
      while (true) {
        const foundIndex = content.indexOf(wordText, searchIndex);
        if (foundIndex === -1) break;
        const isOverlapping = identified.some(
          (existing) =>
            (foundIndex >= existing.startIndex &&
              foundIndex < existing.endIndex) ||
            (foundIndex + wordText.length > existing.startIndex &&
              foundIndex + wordText.length <= existing.endIndex)
        );
        if (!isOverlapping) {
          identified.push({
            word: wordText,
            startIndex: foundIndex,
            endIndex: foundIndex + wordText.length,
            wordData: {
              pinyin: wordData.pinyin,
              definition: wordData.definition,
              hskLevel: wordData.hskLevel,
            },
          });
        }
        searchIndex = foundIndex + 1;
      }
    });

    identified.sort((a, b) => a.startIndex - b.startIndex);
    identified.forEach((word) => {
      if (currentIndex < word.startIndex) {
        result.push({
          text: content.slice(currentIndex, word.startIndex),
          startIndex: currentIndex,
          endIndex: word.startIndex,
          isWord: false,
        });
      }
      result.push({
        text: word.word,
        startIndex: word.startIndex,
        endIndex: word.endIndex,
        isWord: true,
        wordData: word.wordData,
      });
      currentIndex = word.endIndex;
    });
    if (currentIndex < content.length) {
      result.push({
        text: content.slice(currentIndex),
        startIndex: currentIndex,
        endIndex: content.length,
        isWord: false,
      });
    }
    return result;
  }, [passage.content, passage.words, passage.segments]);

  const handleWordClick = (
    segment: ClickableSegment,
    event: React.MouseEvent
  ) => {
    if (!segment.isWord || !segment.wordData) return;

    // Multi-select path: toggle selection without opening popup
    if (multiSelect && onToggleSelect) {
      const key = `${segment.startIndex}-${segment.endIndex}-${segment.text}`;
      onToggleSelect(key, segment.text, segment.startIndex, segment.endIndex);
      return;
    }

    const existingResponse = wordResponses.find((r) => r.word === segment.text);

    // Get click position
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const x = rect.left + rect.width / 2; // Center of the clicked word
    const y = rect.top; // Top of the clicked word

    setPopupState({
      isOpen: true,
      word: segment.text,
      pinyin: segment.wordData.pinyin,
      definition: segment.wordData.definition,
      startIndex: segment.startIndex,
      endIndex: segment.endIndex,
      currentStatus: existingResponse?.status,
      position: { x, y },
    });
  };

  const handleStatusSelect = (status: WordStatus | null) => {
    // If status is null, it means remove the marking (back to known/default)
    if (status === null) {
      onRemoveWordResponse(popupState.word);
      return;
    }

    const response: WordResponse = {
      word: popupState.word,
      status,
      startIndex: popupState.startIndex,
      endIndex: popupState.endIndex,
    };

    onWordResponse(response);
  };

  const getWordStatus = (word: string): WordStatus | undefined => {
    return wordResponses.find((r) => r.word === word)?.status;
  };

  const getStatusColor = (status: WordStatus | undefined) => {
    switch (status) {
      case "partial":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
      case "unknown":
        return "bg-red-500/20 text-red-400 border-red-500/50";
      default:
        // No status = known (default), show subtle hover effect
        return "hover:bg-[#4040f2]/10 hover:text-[#4040f2] border-transparent hover:border-[#4040f2]/30";
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">{passage.title}</h2>
        <p className="text-sm text-[#a6a6a6] font-inter">
          All words are considered <span className="text-green-400">Known</span>{" "}
          by default. Click to mark as{" "}
          <span className="text-yellow-400">Partial</span> or{" "}
          <span className="text-red-400">Unknown</span>
        </p>
      </div>

      {/* Passage Content */}
      <div className="bg-[#1a1d23] rounded-xl p-6 border border-[#404040]">
        <div className="text-xl leading-relaxed text-white font-medium">
          {segments.map((segment, index) => {
            if (!segment.isWord) {
              return (
                <span key={index} className="text-white">
                  {segment.text}
                </span>
              );
            }

            const status = getWordStatus(segment.text);
            const colorClass = getStatusColor(status);
            const isSelected = selectedKeys?.has(
              `${segment.startIndex}-${segment.endIndex}-${segment.text}`
            );

            return (
              <span
                key={index}
                onClick={(event) => handleWordClick(segment, event)}
                className={cn(
                  "cursor-pointer rounded border transition-all duration-200 mx-0.5 select-none",
                  colorClass,
                  multiSelect && isSelected
                    ? "underline decoration-[#4040f2] decoration-2"
                    : undefined
                )}
                title={`${segment.text} (${segment.wordData?.pinyin}) - Click to mark`}
              >
                {segment.text}
              </span>
            );
          })}
        </div>
      </div>

      {/* Pinyin intentionally hidden in assessment to avoid hints */}

      {/* Translation */}
      <div className="bg-[#2e323a] rounded-xl p-4 border border-[#404040]">
        <h3 className="text-sm font-semibold text-[#a6a6a6] mb-2">
          Translation:
        </h3>
        <p className="text-white font-inter leading-relaxed">
          {passage.translation}
        </p>
      </div>

      {/* Word Popup */}
      <WordPopup
        isOpen={popupState.isOpen}
        onClose={() => setPopupState((prev) => ({ ...prev, isOpen: false }))}
        word={popupState.word}
        pinyin={popupState.pinyin}
        definition={popupState.definition}
        currentStatus={popupState.currentStatus}
        position={popupState.position}
        onStatusSelect={handleStatusSelect}
      />
    </div>
  );
};
