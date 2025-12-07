"use client";

import { Mic, Loader2, X, Check } from "lucide-react";
import { AudioWaveform } from "./AudioWaveform";

interface MessageInputProps {
  recording: boolean;
  recPrompt: string;
  uploadingAudio: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording?: () => void;
  audioStream?: MediaStream | null;
  sendDisabled?: boolean;
  sendDisabledReason?: string;
  audioDisabled?: boolean;
  audioDisabledReason?: string;
}

export function MessageInput({
  recording,
  recPrompt,
  uploadingAudio,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  audioStream,
  sendDisabled = false,
  sendDisabledReason,
  audioDisabled = false,
  audioDisabledReason,
}: MessageInputProps) {
  return (
    <div className="w-full flex justify-center">
      {recording ? (
        <div className="flex items-center min-h-[58px] w-1/2 bg-[#1a1d23] border border-[#2e323a] rounded-full px-4 h-14">
          <div className="flex-1 flex items-center gap-3 overflow-hidden h-full">
            <AudioWaveform stream={audioStream ?? null} isActive={recording} />
          </div>
          <div className="flex items-center gap-2 pl-3">
            <button
              onClick={onCancelRecording}
              className="p-2 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#1a1d23] text-[#a6a6a6] hover:text-white hover:bg-[#2e323a] cursor-pointer"
              style={{ touchAction: "manipulation" }}
              type="button"
              aria-label="Cancel recording"
              title="Cancel"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={onStopRecording}
              className="p-2 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#1a1d23] text-green-400 hover:text-white hover:bg-green-500 cursor-pointer"
              style={{ touchAction: "manipulation" }}
              type="button"
              aria-label="Send recording"
              title="Send"
            >
              <Check className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="w-1/2 min-h-[58px] bg-[#1a1d23] border border-[#2e323a] rounded-full pl-6 pr-4 sm:pl-6 sm:pr-4 py-2 flex justify-between items-center gap-3 text-center shadow-[0_6px_20px_rgba(0,0,0,0.2)]">
          <div className="space-y-1">
            <p className="text-sm text-[#a6a6a6]">{recPrompt}</p>
            {sendDisabledReason && (
              <p className="text-xs text-[#f2b94c]">{sendDisabledReason}</p>
            )}
          </div>
          <button
            onClick={onStartRecording}
            className={`relative inline-flex items-center justify-center rounded-full border border-[#2e323a] h-10 w-10 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#1a1d23] ${
              audioDisabled || sendDisabled
                ? "cursor-not-allowed bg-[#1f232c] text-[#5d6172]"
                : "cursor-pointer bg-[#4040f2] text-white hover:bg-[#3535d1]"
            }`}
            style={{ touchAction: "manipulation" }}
            title={
              audioDisabled || sendDisabled
                ? audioDisabledReason ||
                  sendDisabledReason ||
                  "Voice input temporarily unavailable"
                : "Tap to speak"
            }
            type="button"
            aria-label="Start recording"
            disabled={audioDisabled || sendDisabled}
          >
            {uploadingAudio ? (
              <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
            ) : (
              <Mic className="w-6 h-6" aria-hidden="true" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
