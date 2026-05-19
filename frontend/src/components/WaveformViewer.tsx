"use client";

import { useRef, useEffect, useCallback } from "react";

interface WaveformViewerProps {
  analyserNode: AnalyserNode | null;
  mode: "waveform" | "spectrogram";
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

function getColor(canvas: HTMLCanvasElement, name: string, fallback: string): string {
  return getComputedStyle(canvas).getPropertyValue(name).trim() || fallback;
}

function drawWaveform(canvas: HTMLCanvasElement, analyser: AnalyserNode) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);

  const accent = getColor(canvas, "--accent", "#d4a853");
  const step = width / data.length;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = getColor(canvas, "--bg-secondary", "#141414");
  ctx.fillRect(0, 0, width, height);

  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  for (let i = 0; i < data.length; i++) {
    ctx.lineTo(i * step, ((data[i] / 128) * height) / 2);
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, accent + "00");
  grad.addColorStop(0.5, accent + "18");
  grad.addColorStop(1, accent + "00");
  ctx.fillStyle = grad;
  ctx.fill();
}

function drawSpectrogram(canvas: HTMLCanvasElement, analyser: AnalyserNode) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);

  const accent = getColor(canvas, "--accent", "#d4a853");

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = getColor(canvas, "--bg-secondary", "#141414");
  ctx.fillRect(0, 0, width, height);

  const barW = Math.max(2, (width / data.length) * 2.5);
  const gap = Math.max(1, barW * 0.3);
  const n = Math.min(data.length, Math.floor(width / (barW + gap)));

  for (let i = 0; i < n; i++) {
    const h = (data[i] / 255) * height;
    const grad = ctx.createLinearGradient(0, height, 0, height - h);
    grad.addColorStop(0, accent);
    grad.addColorStop(0.4, accent + "cc");
    grad.addColorStop(1, accent + "44");
    ctx.fillStyle = grad;
    ctx.fillRect(i * (barW + gap), height - h, barW, h);
  }
}

function drawPlayhead(canvas: HTMLCanvasElement, progress: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const x = Math.floor(progress * canvas.width);
  ctx.strokeStyle = getColor(canvas, "--accent", "#d4a853");
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, canvas.height);
  ctx.stroke();
}

export default function WaveformViewer({
  analyserNode, mode, isPlaying, currentTime, duration, onSeek,
}: WaveformViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const stateRef = useRef({ mode, isPlaying, progress: 0 });

  stateRef.current = {
    mode,
    isPlaying,
    progress: duration > 0 ? currentTime / duration : 0,
  };

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserNode) return;

    const { mode: m, progress } = stateRef.current;
    if (m === "waveform") drawWaveform(canvas, analyserNode);
    else drawSpectrogram(canvas, analyserNode);

    drawPlayhead(canvas, progress);
  }, [analyserNode]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !analyserNode) return;
    const loop = () => {
      render();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, analyserNode, render]);

  // Render once on mode toggle or pause
  useEffect(() => {
    if (!isPlaying) render();
  }, [mode, render, isPlaying]);

  // Loading
  if (!analyserNode) {
    return (
      <div className="relative rounded-lg overflow-hidden" style={{ aspectRatio: "800/120" }}>
        <div className="skeleton w-full h-full" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="w-[3px] rounded-full animate-pulse"
                style={{
                  height: `${12 + Math.random() * 28}px`,
                  background: "var(--text-tertiary)",
                  opacity: 0.2 + Math.random() * 0.3,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={mode === "waveform" ? 120 : 160}
      className="w-full cursor-pointer rounded-lg"
      style={{
        border: "1px solid var(--border-color)",
        maxWidth: "100%",
        height: "auto",
        aspectRatio: mode === "waveform" ? "800/120" : "800/160",
      }}
      onClick={(e) => {
        if (!duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - rect.left) / rect.width) * duration);
      }}
    />
  );
}
