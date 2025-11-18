"use client";

import { useCallback, useRef, useState } from "react";

type Options = {
  onData?: (blob: Blob) => void | Promise<void>;
};

export function useAudioRecorder(options?: Options) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef<boolean>(false);
  const [recording, setRecording] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recPrompt, setRecPrompt] = useState<string>("Tap to speak");
  const [uploadingAudio, setUploadingAudio] = useState<boolean>(false);

  const cleanup = useCallback(() => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    } catch {}
    setStream(null);
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    cancelledRef.current = false;
  }, []);

  const start = useCallback(async () => {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = audioStream;
      setStream(audioStream);
      const rec = new MediaRecorder(audioStream);
      mediaRecorderRef.current = rec;
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const wasCancelled = cancelledRef.current;
        if (wasCancelled) {
          cleanup();
          return;
        }
        try {
          setUploadingAudio(true);
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          await options?.onData?.(blob);
        } finally {
          setUploadingAudio(false);
          setRecPrompt("Tap to speak");
          cleanup();
        }
      };
      rec.start();
      setRecording(true);
      setRecPrompt("Listening... Tap when done");
    } catch {
      setRecPrompt("Mic permission denied");
      cleanup();
    }
  }, [options, cleanup]);

  const stop = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
      setRecording(false);
      setRecPrompt("Processing...");
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    } else {
      cleanup();
    }
    setRecording(false);
    setRecPrompt("Tap to speak");
    setStream(null);
  }, [cleanup]);

  return { start, stop, cancel, recording, recPrompt, uploadingAudio, stream };
}
