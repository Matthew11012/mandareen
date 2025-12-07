"use client";

import { useEffect, useRef, useState } from "react";

interface AudioWaveformProps {
  stream: MediaStream | null;
  isActive: boolean;
}

export function AudioWaveform({ stream, isActive }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const previousValuesRef = useRef<number[] | null>(null);
  const [barCount, setBarCount] = useState<number>(48);

  // Detect mobile vs desktop and update bar count
  useEffect(() => {
    const updateBarCount = () => {
      const isMobile = window.innerWidth < 768;
      setBarCount(isMobile ? 24 : 96);
    };

    updateBarCount();
    window.addEventListener("resize", updateBarCount);
    return () => window.removeEventListener("resize", updateBarCount);
  }, []);

  useEffect(() => {
    if (!stream || !isActive) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const AC =
      typeof window !== "undefined"
        ? // Older Safari exposes webkitAudioContext
          (window as unknown as { AudioContext?: typeof AudioContext })
            .AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!AC) return;
    const audioContext: AudioContext = new AC();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount as number;
    const dataArray: Uint8Array<ArrayBuffer> = new Uint8Array(bufferLength);

    source.connect(analyser);
    analyserRef.current = analyser;
    dataArrayRef.current = dataArray;
    audioContextRef.current = audioContext;

    previousValuesRef.current = new Array(barCount).fill(0);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Ensure canvas internal width matches rendered width for crisp drawing
    const resizeCanvasToDisplaySize = () => {
      const { clientWidth, clientHeight } = canvas;
      if (clientWidth === 0 || clientHeight === 0) return;
      if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
        canvas.width = clientWidth;
        canvas.height = clientHeight;
      }
    };

    const draw = () => {
      if (!isActive || !analyserRef.current || !dataArrayRef.current) return;

      animationFrameRef.current = requestAnimationFrame(draw);

      analyserRef.current.getByteFrequencyData(dataArrayRef.current!);

      resizeCanvasToDisplaySize();

      const width = canvas.width;
      const height = canvas.height;

      const activeBarCount = previousValuesRef.current?.length ?? barCount;
      if (activeBarCount !== barCount) {
        previousValuesRef.current = new Array(barCount).fill(0);
      }
      const gap = 2;
      const centerY = height / 2;

      const baseLevel = 0.05;
      const decay = 0.8;
      const attack = 0.2;

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < activeBarCount; i++) {
        const dataIndex = Math.floor(
          (i / activeBarCount) * dataArrayRef.current.length
        );
        const sample = dataArrayRef.current[dataIndex] / 255;

        const prev =
          previousValuesRef.current && previousValuesRef.current[i] != null
            ? previousValuesRef.current[i]
            : 0;
        const target = sample;
        const smoothed = prev * decay + target * attack;
        const value = Math.max(baseLevel, smoothed);

        if (previousValuesRef.current) {
          previousValuesRef.current[i] = value;
        }

        const barHeight = value * (height * 0.9);

        const calculatedBarWidth = width / activeBarCount - gap;
        const x = i * (calculatedBarWidth + gap);
        const topY = centerY - barHeight / 2;
        const bottomY = centerY + barHeight / 2;

        const gradient = ctx.createLinearGradient(0, topY, 0, bottomY);
        gradient.addColorStop(0, "#6366f1");
        gradient.addColorStop(0.5, "#818cf8");
        gradient.addColorStop(1, "#6366f1");

        ctx.fillStyle = gradient;
        ctx.fillRect(x, topY, calculatedBarWidth, barHeight);
      }
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
      }
    };
  }, [stream, isActive, barCount]);

  if (!isActive) return null;

  return (
    <div className="flex items-center justify-center w-full">
      <canvas ref={canvasRef} className="h-6 w-full" aria-hidden="true" />
    </div>
  );
}
