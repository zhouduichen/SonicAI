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

function drawWaveform(canvas: HTMLCanvasElement, analyserNode: AnalyserNode) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvas;
  const dataArray = new Uint8Array(analyserNode.fftSize);
  analyserNode.getByteTimeDomainData(dataArray);

  ctx.clearRect(0, 0, width, height);

  const bg = getComputedStyle(canvas).getPropertyValue("--bg-secondary").trim() || "#141414";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const accent = getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#d4a853";
  const sliceWidth = width / dataArray.length;

  ctx.beginPath();
  ctx.moveTo(0, height / 2);

  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * height) / 2;
    ctx.lineTo(i * sliceWidth, y);
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

function drawSpectrogram(canvas: HTMLCanvasElement, analyserNode: AnalyserNode) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvas;
  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyserNode.getByteFrequencyData(dataArray);

  ctx.clearRect(0, 0, width, height);

  const bg = getComputedStyle(canvas).getPropertyValue("--bg-secondary").trim() || "#141414";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const accent = getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#d4a853";
  const barWidth = Math.max(2, (width / bufferLength) * 2.5);
  const gap = Math.max(1, barWidth * 0.3);
  const usableBins = Math.min(bufferLength, Math.floor(width / (barWidth + gap)));

  for (let i = 0; i < usableBins; i++) {
    const value = dataArray[i] / 255;
    const barHeight = value * height;

    const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
    grad.addColorStop(0, accent);
    grad.addColorStop(0.4, accent + "cc");
    grad.addColorStop(1, accent + "44");

    ctx.fillStyle = grad;
    ctx.fillRect(i * (barWidth + gap), height - barHeight, barWidth, barHeight);
  }
}

export default function WaveformViewer({
  analyserNode, mode, isPlaying, currentTime, duration, onSeek,
}: WaveformViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const modeRef = useRef(mode);
  const progressRef = useRef(0);
  const [isTainted, setIsTainted] = useState(false);
  const taintCheckRef = useRef(0);

  modeRef.current = mode;
  progressRef.current = duration > 0 ? currentTime / duration : 0;

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserNode) return;

    // Detect cross-origin taint: analyser returns all zeros
    if (!isTainted && isPlaying) {
      const testData = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteFrequencyData(testData);
      if (testData.every((v) => v === 0)) {
        taintCheckRef.current += 1;
        if (taintCheckRef.current > 5) {
          setIsTainted(true);
          return;
        }
      } else {
        taintCheckRef.current = 0;
      }
    }

    if (modeRef.current === "waveform") {
      drawWaveform(canvas, analyserNode);
    } else {
      drawSpectrogram(canvas, analyserNode);
    }

    // Playhead
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const playedX = Math.floor(progressRef.current * canvas.width);
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#d4a853";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playedX, 0);
    ctx.lineTo(playedX, canvas.height);
    ctx.stroke();
  }, [analyserNode, isPlaying, isTainted]);

  // Reset taint when analyser changes (new track)
  useEffect(() => {
    setIsTainted(false);
    taintCheckRef.current = 0;
  }, [analyserNode]);

  // Animation loop while playing
  useEffect(() => {
    if (!isPlaying || !analyserNode) return;
    const loop = () => {
      render();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, analyserNode, render]);

  // Single render when paused or mode toggled
  useEffect(() => {
    if (!isPlaying) render();
  }, [mode, render, isPlaying]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(ratio * duration);
  };

  // Loading skeleton
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

  // Cross-origin taint overlay
  if (isTainted) {
    return (
      <div
        className="w-full cursor-pointer rounded-lg flex items-center justify-center"
        style={{
          border: "1px solid var(--border-color)",
          aspectRatio: "800/120",
          background: "var(--bg-secondary)",
        }}
        onClick={(e) => {
          if (!duration) return;
          const rect = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - rect.left) / rect.width) * duration);
        }}
      >
        <div className="text-center space-y-2">
          <div className="flex items-center gap-2 justify-center">
            <div className="w-4 h-px" style={{ background: "var(--accent)", opacity: 0.3 }} />
            <span className="text-[10px] font-mono tracking-[0.15em] uppercase" style={{ color: "var(--text-tertiary)" }}>
              可视化不可用
            </span>
            <div className="w-4 h-px" style={{ background: "var(--accent)", opacity: 0.3 }} />
          </div>
          <p className="text-[10px] font-mono tracking-wider" style={{ color: "var(--text-tertiary)", opacity: 0.5 }}>
            跨域音频源不支持实时分析
          </p>
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      width={800}
      height={mode === "waveform" ? 120 : 160}
      className="w-full cursor-pointer rounded-lg"
      style={{
        border: "1px solid var(--border-color)",
        maxWidth: "100%",
        height: "auto",
        aspectRatio: mode === "waveform" ? "800/120" : "800/160",
      }}
    />
  );
}
