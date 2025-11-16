"use client";

import { Mic, Send, Loader2, X, Check } from "lucide-react";
import { AudioWaveform } from "./AudioWaveform";

interface MessageInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
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
  input,
  onInputChange,
  onSend,
  recording,
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
  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (sendDisabled) return;
      onSend();
    }
  };

  return (
    <div className="w-full">
      {recording ? (
        <div className="flex items-center w-full bg-[#1a1d23] border border-[#2e323a] rounded-lg px-4 h-14">
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
        <div className="relative flex items-center w-full">
          <input
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything"
            className="w-full bg-[#1a1d23] border border-[#2e323a] rounded-lg px-4 h-14 pr-24 text-base text-white placeholder-[#888] outline-none focus:border-[#4040f2] transition-colors"
          />
          <div className="absolute right-2 flex items-center gap-1">
            <button
              onClick={onStartRecording}
              className={`p-2 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#1a1d23] ${
                audioDisabled
                  ? "text-[#55596a] cursor-not-allowed"
                  : "text-[#a6a6a6] hover:text-white hover:bg-[#2e323a] cursor-pointer"
              }`}
              style={{ touchAction: "manipulation" }}
              title={
                audioDisabled
                  ? audioDisabledReason || "Voice input temporarily unavailable"
                  : "Tap to speak"
              }
              type="button"
              aria-label="Start recording"
              disabled={audioDisabled}
            >
              {uploadingAudio ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={onSend}
              className={`p-2 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#1a1d23] ${
                sendDisabled
                  ? "text-[#777b94] cursor-not-allowed"
                  : "text-[#4040f2] hover:text-white hover:bg-[#4040f2] cursor-pointer"
              }`}
              style={{ touchAction: "manipulation" }}
              type="button"
              aria-label="Send message"
              disabled={sendDisabled}
              title={sendDisabled ? sendDisabledReason : undefined}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
