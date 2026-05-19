# Fix Waveform & Spectrogram Visualization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken waveform/spectrogram display by replacing the CORS-blocked fetch+decode pipeline with a real-time AnalyserNode-based visualization driven by the existing `<audio>` element.

**Architecture:** Merge two independent audio paths into one. MusicPlayer creates an AudioContext + AnalyserNode from the existing `<audio>` element on first play. WaveformViewer becomes a pure canvas renderer that reads real-time data from `getByteTimeDomainData()` (waveform) or `getByteFrequencyData()` (spectrogram).

**Tech Stack:** React 19 + TypeScript, Web Audio API (AnalyserNode), Canvas 2D, Framer Motion

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/components/WaveformViewer.tsx` | Rewrite | Pure canvas renderer — receives AnalyserNode, draws waveform or spectrogram, handles loading/error states |
| `frontend/src/components/MusicPlayer.tsx` | Modify | Add AudioContext + AnalyserNode lifecycle; wire `<audio>` → MediaElementSourceNode → AnalyserNode; pass analyser to WaveformViewer |

---

### Task 1: Rewrite WaveformViewer — pure canvas renderer with state handling

**Files:**
- Create: (none)
- Modify: `frontend/src/components/WaveformViewer.tsx` (full rewrite)

- [ ] **Step 1: Replace the entire file with the new implementation**

Write `frontend/src/components/WaveformViewer.tsx`:

```tsx
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

function drawWaveform(
  canvas: HTMLCanvasElement,
  analyserNode: AnalyserNode,
) {
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

  // Subtle glow under the waveform
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, accent + "00");
  grad.addColorStop(0.5, accent + "18");
  grad.addColorStop(1, accent + "00");
  ctx.fillStyle = grad;
  ctx.fill();
}

function drawSpectrogram(
  canvas: HTMLCanvasElement,
  analyserNode: AnalyserNode,
) {
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
    ctx.fillRect(
      i * (barWidth + gap),
      height - barHeight,
      barWidth,
      barHeight,
    );
  }
}

export default function WaveformViewer({
  analyserNode,
  mode,
  isPlaying,
  currentTime,
  duration,
  onSeek,
}: WaveformViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const modeRef = useRef(mode);
  const progressRef = useRef(0);

  modeRef.current = mode;
  progressRef.current = duration > 0 ? currentTime / duration : 0;

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserNode) return;

    if (modeRef.current === "waveform") {
      drawWaveform(canvas, analyserNode);
    } else {
      drawSpectrogram(canvas, analyserNode);
    }

    // Draw playhead
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const accent = getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#d4a853";
    const playedX = Math.floor(progressRef.current * canvas.width);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playedX, 0);
    ctx.lineTo(playedX, canvas.height);
    ctx.stroke();
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

  // Render once when paused or mode switches
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
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /d/aimusic/frontend && npx tsc --noEmit src/components/WaveformViewer.tsx 2>&1`
Expected: no type errors (may show unrelated project-level errors, ignore those — only check WaveformViewer-specific errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/WaveformViewer.tsx
git commit -m "refactor: rewrite WaveformViewer as AnalyserNode-driven canvas renderer

Replace the broken fetch+decode+DFT pipeline with real-time Web Audio
API visualization. Add loading skeleton state when analyser is not yet
available."
```

---

### Task 2: Modify MusicPlayer — add AudioContext + AnalyserNode lifecycle

**Files:**
- Modify: `frontend/src/components/MusicPlayer.tsx` (add audio analysis setup, wire to WaveformViewer)

- [ ] **Step 1: Add AudioContext/AnalyserNode management to MusicPlayer**

Replace the content of `frontend/src/components/MusicPlayer.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Download, Waveform, ChartBar } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import type { GeneratedMusic } from "@/types";
import WaveformViewer from "./WaveformViewer";

interface MusicPlayerProps {
  music: GeneratedMusic | null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MusicPlayer({ music }: MusicPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [vizMode, setVizMode] = useState<"waveform" | "spectrogram">("waveform");
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (music) {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [music]);

  const setupAnalyser = useCallback(() => {
    if (analyserRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;

      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);

      analyserRef.current = analyser;
      sourceRef.current = source;
      setAnalyserNode(analyser);
    } catch {
      // createMediaElementSource already called, or cross-origin blocked
    }
  }, []);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    setupAnalyser();
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };

  if (!music) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
    >
      <div className="card-outer">
        <div className="card-inner p-6 space-y-5 relative overflow-hidden">
          <audio
            ref={audioRef}
            src={music.filePath}
            crossOrigin="anonymous"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
          />

          {/* Top ornaments */}
          <div className="flex items-center gap-2 justify-center -mt-1 mb-1">
            <div className="w-1.5 h-1.5 rotate-45" style={{ background: "var(--accent)", opacity: 0.3 }} />
            <div className="w-4 h-px" style={{ background: "var(--accent)", opacity: 0.2 }} />
            <div className="w-1.5 h-1.5 rotate-45" style={{ background: "var(--accent)", opacity: 0.5 }} />
            <div className="w-4 h-px" style={{ background: "var(--accent)", opacity: 0.2 }} />
            <div className="w-1.5 h-1.5 rotate-45" style={{ background: "var(--accent)", opacity: 0.3 }} />
          </div>

          {/* Track info */}
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm italic font-medium truncate"
                style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
                {music.title}
              </p>
              <p className="text-[10px] font-mono tracking-[0.1em] uppercase truncate mt-0.5"
                style={{ color: "var(--accent)" }}>
                {music.styleName}
              </p>
            </div>
            <button className="p-2 transition-colors rounded-full"
              style={{ color: "var(--text-tertiary)" }}>
              <Download size={16} weight="regular" />
            </button>
          </div>

          {/* Waveform Viewer */}
          <div className="space-y-1">
            <div className="flex items-center justify-end">
              <button
                onClick={() => setVizMode(vizMode === "waveform" ? "spectrogram" : "waveform")}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors"
                style={{ color: "var(--text-tertiary)", fontSize: 10 }}
              >
                {vizMode === "waveform" ? (
                  <><Waveform size={12} /> 波形图</>
                ) : (
                  <><ChartBar size={12} /> 频谱图</>
                )}
              </button>
            </div>
            <WaveformViewer
              analyserNode={analyserNode}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              mode={vizMode}
              onSeek={(t) => {
                if (audioRef.current) audioRef.current.currentTime = t;
              }}
            />
          </div>

          {/* Progress bar */}
          <div
            className="h-1 cursor-pointer group relative rounded-full"
            style={{ background: "var(--bg-tertiary)" }}
            onClick={handleSeek}
          >
            <div
              className="h-full transition-all duration-150 relative rounded-full"
              style={{
                background: "var(--accent)",
                width: duration ? `${(currentTime / duration) * 100}%` : "0%",
              }}
            >
              <div className="absolute -right-1.5 -top-1 w-3 h-3 rotate-45 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "var(--accent)" }} />
            </div>
          </div>

          {/* Time + Controls */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              {formatTime(currentTime)}
            </span>

            <div className="flex items-center gap-6">
              <button className="p-1.5 transition-colors rounded-full"
                style={{ color: "var(--text-tertiary)" }}>
                <SkipBack size={18} weight="regular" />
              </button>

              <button
                onClick={togglePlay}
                className="w-12 h-12 rotate-45 flex items-center justify-center transition-all active:scale-90"
                style={{
                  background: "var(--accent)",
                  borderRadius: 10,
                }}
              >
                {isPlaying
                  ? <Pause size={18} weight="fill" className="-rotate-45" style={{ color: "#1a1814" }} />
                  : <Play size={18} weight="fill" className="-rotate-45 ml-0.5" style={{ color: "#1a1814" }} />
                }
              </button>

              <button className="p-1.5 transition-colors rounded-full"
                style={{ color: "var(--text-tertiary)" }}>
                <SkipForward size={18} weight="regular" />
              </button>
            </div>

            <span className="text-[10px] font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              {duration ? formatTime(duration) : "--:--"}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
```

Key changes from original:
- Lines 25-27: Added `analyserNode` state + `audioCtxRef`, `sourceRef`, `analyserRef` refs
- Lines 39-56: `setupAnalyser` callback — lazy-creates AudioContext + AnalyserNode on first play
- Lines 58-63: Cleanup effect — closes AudioContext on unmount
- Line 67: `togglePlay` now calls `setupAnalyser()` before play
- Line 87: `<audio>` now has `crossOrigin="anonymous"` attribute
- Lines 125-133: `WaveformViewer` props changed from `audioUrl` to `analyserNode`

- [ ] **Step 2: Verify the file compiles**

Run: `cd /d/aimusic/frontend && npx tsc --noEmit src/components/MusicPlayer.tsx 2>&1`
Expected: no type errors (ignore unrelated project-level errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MusicPlayer.tsx
git commit -m "feat: add AudioContext + AnalyserNode lifecycle to MusicPlayer

Create AnalyserNode from <audio> element on first play. Pass analyser
to WaveformViewer instead of audioUrl. AudioContext persists across
track changes, closes only on unmount."
```

---

### Task 3: Verify the fix end-to-end

- [ ] **Step 1: Start the development server**

Run: `cd /d/aimusic/frontend && npm run dev`
Expected: Next.js dev server starts on http://localhost:3000

- [ ] **Step 2: Test in browser**

Open http://localhost:3000/create and verify:
- **Loading state**: Before playing any track, the visualization area shows a skeleton/shimmer bar animation (not blank)
- **Waveform mode**: Click a track in the playlist, then click play. The canvas should show an animated real-time waveform line in brass gold color on dark background
- **Spectrogram mode**: Click the toggle button (频谱图) in the player. The canvas should show real-time frequency bar chart
- **Mode toggle**: Switching between 波形图/频谱图 updates the canvas immediately
- **Pause state**: When paused, the visualization holds its last frame with a progress line
- **Track switch**: Click a different track. The visualization should reset (loading skeleton) and re-initialize on play

- [ ] **Step 3: Commit** (if any fixes needed from testing)

```bash
git add -A
git commit -m "chore: final adjustments after manual verification"
```

---

### Task 4: Final verification and wrap-up

- [ ] **Step 1: Run TypeScript check on full project**

Run: `cd /d/aimusic/frontend && npx tsc --noEmit 2>&1`
Expected: no new type errors introduced by the changes

- [ ] **Step 2: Verify both files are committed**

Run: `cd /d/aimusic && git status`
Expected: working tree clean, both files in HEAD

- [ ] **Step 3: Commit any remaining changes**

```bash
git add -A
git commit -m "fix: waveform and spectrogram now render via AnalyserNode

Replace fetch+decode+DFT pipeline with real-time Web Audio AnalyserNode
visualization. AudioContext is lazily created on first play and reused
across track changes. Loading state shows skeleton animation."
```
