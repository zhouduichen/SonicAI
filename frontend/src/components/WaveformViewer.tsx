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

  const bg = getColor(canvas, "--bg-secondary", "#141414");
  const accent = getColor(canvas, "--accent", "#d4a853");
  const mid = height / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Peak-based waveform per pixel column
  const samplesPerCol = Math.max(1, Math.floor(data.length / width));
  const len = width * samplesPerCol;

  for (let x = 0; x < width; x++) {
    let min = 1.0, max = -1.0;
    const start = x * samplesPerCol;
    for (let s = 0; s < samplesPerCol && start + s < len; s++) {
      const v = data[start + s] / 128.0 - 1.0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const yTop = mid + max * mid;
    const yBot = mid + min * mid;
    const h = Math.max(1, yBot - yTop);

    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.65 + Math.abs(max - min) * 0.35;
    ctx.fillRect(x, yTop, 1, h);
    ctx.globalAlpha = 1;
  }

  // Center line
  ctx.strokeStyle = accent + "1a";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(width, mid);
  ctx.stroke();
}

function drawSpectrogram(canvas: HTMLCanvasElement, analyser: AnalyserNode) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);

  const bg = getColor(canvas, "--bg-secondary", "#141414");
  const accent = getColor(canvas, "--accent", "#d4a853");

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Logarithmic frequency scale — 64 bars emphasizing audible range
  const barCount = 64;
  const barW = Math.max(2, Math.floor(width / barCount) - 3);
  const gap = Math.max(1, (width - barCount * barW) / (barCount + 1));
  const offsetX = (width - barCount * barW - (barCount - 1) * gap) / 2;

  for (let i = 0; i < barCount; i++) {
    const t = i / (barCount - 1);
    const idx = Math.min(data.length - 1, Math.floor(Math.pow(data.length, t)));
    const v = data[idx] / 255;
    const barH = v * height * 0.82;
    if (barH < 0.5) continue;

    const x = offsetX + i * (barW + gap);
    const y = height - barH;

    const grad = ctx.createLinearGradient(0, y, 0, height);
    grad.addColorStop(0, accent + "ff");
    grad.addColorStop(0.3, accent + "cc");
    grad.addColorStop(1, accent + "33");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
    ctx.fill();
  }

  // Baseline
  ctx.strokeStyle = accent + "1a";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(width, height);
  ctx.stroke();
}

function drawPlayhead(canvas: HTMLCanvasElement, progress: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const x = Math.floor(progress * canvas.width);
  if (x === 0) return;

  ctx.strokeStyle = getColor(canvas, "--accent", "#d4a853");
  ctx.lineWidth = 1;
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

    if (progress > 0) drawPlayhead(canvas, progress);
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
      aria-label={mode === "waveform" ? "波形可视化" : "频谱可视化"}
      role="img"
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
