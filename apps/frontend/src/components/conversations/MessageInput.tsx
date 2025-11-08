"use client";

import { Mic, Send, Loader2 } from "lucide-react";

interface MessageInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  recording: boolean;
  recPrompt: string;
  uploadingAudio: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export function MessageInput({
  input,
  onInputChange,
  onSend,
  recording,
  recPrompt,
  uploadingAudio,
  onStartRecording,
  onStopRecording,
}: MessageInputProps) {
  return (
    <div className="flex items-center gap-2 w-full flex-wrap">
      <button
        onClick={() => {
          if (!recording) onStartRecording();
          else onStopRecording();
        }}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors duration-200 cursor-pointer max-w-full ${
          recording
            ? "bg-red-600/10 border-red-600/40 text-red-200"
            : "bg-[#1b1f26] border-[#2e323a] text-[#a6a6a6] hover:border-[#4040f2]"
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#1b1f26]`}
        title={recording ? "Tap when done" : "Tap to speak"}
        type="button"
        aria-pressed={recording}
        aria-label={recording ? "Stop recording" : "Start recording"}
      >
        <div className="relative shrink-0">
          <div
            className={`rounded-full p-2 ${
              recording ? "bg-red-600/20" : "bg-green-600/20"
            }`}
          >
            <Mic className="w-4 h-4" />
          </div>
          {recording ? (
            <span className="absolute inset-0 rounded-full ring-2 ring-red-500 motion-safe:animate-ping" />
          ) : null}
        </div>
        <div className="flex flex-col items-start min-w-0 overflow-hidden hidden sm:block">
          <span className="text-xs font-medium text-white truncate max-w-[55vw] sm:max-w-none">
            {recPrompt}
          </span>
          <span className="text-[10px] text-[#808080] hidden sm:block">
            {recording ? "Start speaking • Tap when done" : ""}
          </span>
        </div>
        {uploadingAudio ? (
          <Loader2 className="w-4 h-4 animate-spin ml-2 shrink-0" />
        ) : null}
      </button>

      <input
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSend();
        }}
        placeholder="Type your message ..."
        className="flex-1 min-w-0 bg-[#1a1d23] border border-[#2e323a] rounded-lg px-3 py-2 text-white outline-none h-11"
      />
      <button
        onClick={onSend}
        className="px-4 py-2 rounded-lg bg-[#4040f2] text-white text-sm hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer shrink-0 h-11"
        type="button"
        aria-label="Send message"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}

