"use client";

import { useCallback, useRef, useState } from "react";

type Options = {
  onData?: (blob: Blob) => void | Promise<void>;
};

export function useAudioRecorder(options?: Options) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [recPrompt, setRecPrompt] = useState<string>("Tap to speak");
  const [uploadingAudio, setUploadingAudio] = useState<boolean>(false);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        try {
          setUploadingAudio(true);
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          await options?.onData?.(blob);
        } finally {
          setUploadingAudio(false);
          setRecPrompt("Tap to speak"); // Reset prompt after upload completes
          // stop tracks
          try {
            stream.getTracks().forEach((t) => t.stop());
          } catch {}
          mediaRecorderRef.current = null;
        }
      };
      rec.start();
      setRecording(true);
      setRecPrompt("Listening... Tap when done");
    } catch {
      // Surface error handling to caller via prompt state only; caller can toast
      setRecPrompt("Mic permission denied");
    }
  }, [options]);

  const stop = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
      setRecording(false);
      setRecPrompt("Processing...");
    }
  }, []);

  return { start, stop, recording, recPrompt, uploadingAudio };
}
