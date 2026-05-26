"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface WaveformViewerProps {
  analyserNode: AnalyserNode | null;
  mode: "waveform" | "spectrogram";
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

const SKELETON_BARS = [
  { height: "18px", opacity: 0.28 },
  { height: "31px", opacity: 0.42 },
  { height: "24px", opacity: 0.34 },
  { height: "39px", opacity: 0.48 },
  { height: "28px", opacity: 0.38 },
  { height: "43px", opacity: 0.5 },
  { height: "21px", opacity: 0.3 },
  { height: "34px", opacity: 0.44 },
];

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
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, canvas.height);
  ctx.stroke();
}

function drawHoverIndicator(canvas: HTMLCanvasElement, hoverX: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx || hoverX < 0) return;

  ctx.strokeStyle = getColor(canvas, "--accent", "#d4a853") + "44";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(hoverX, 0);
  ctx.lineTo(hoverX, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function WaveformViewer({
  analyserNode, mode, isPlaying, currentTime, duration, onSeek,
}: WaveformViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const stateRef = useRef({ mode, isPlaying, progress: 0 });
  const [hoverX, setHoverX] = useState(-1);
  const [ripple, setRipple] = useState<{ x: number; time: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Ripple animation
  useEffect(() => {
    if (!ripple) return;
    const timeout = setTimeout(() => setRipple(null), 400);
    return () => clearTimeout(timeout);
  }, [ripple]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverX(e.clientX - rect.left);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverX(-1);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const seekTime = (x / rect.width) * duration;
    onSeek(seekTime);
    setRipple({ x, time: seekTime });
  }, [duration, onSeek]);

  if (!analyserNode) {
    return (
      <div className="relative rounded-lg overflow-hidden" style={{ aspectRatio: "800/120" }}>
        <div className="skeleton w-full h-full" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-3">
            {SKELETON_BARS.map((bar, i) => (
              <div
                key={i}
                className="w-[3px] rounded-full animate-pulse"
                style={{
                  height: bar.height,
                  background: "var(--text-tertiary)",
                  opacity: bar.opacity,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const hoverTime = duration > 0 && hoverX > 0
    ? (hoverX / (canvasRef.current?.width || 800)) * duration
    : 0;

  return (
    <div ref={containerRef} className="relative">
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
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />

      {/* Hover time tooltip */}
      {hoverX >= 0 && duration > 0 && (
        <div
          className="absolute top-1 px-2 py-0.5 rounded text-[9px] font-mono pointer-events-none z-10"
          style={{
            left: Math.min(hoverX, (canvasRef.current?.width || 800) - 50),
            background: "var(--bg-secondary)",
            color: "var(--accent)",
            border: "1px solid var(--accent)",
            transform: "translateX(-50%)",
          }}
        >
          {formatTime(hoverTime)}
        </div>
      )}

      {/* Click ripple */}
      {ripple && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: ripple.x,
            width: 2,
            background: "var(--accent)",
            opacity: 0.6,
            transition: "opacity 0.4s ease",
          }}
        />
      )}
    </div>
  );
}
