"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Download, Waveform, ChartBar } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import type { GeneratedMusic } from "@/types";
import WaveformViewer from "./WaveformViewer";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface MusicPlayerProps {
  music: GeneratedMusic | null;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function resolveAudioUrl(music: GeneratedMusic): string {
  const fp = music.filePath;
  if (!fp) return "";
  if (fp.startsWith("http://") || fp.startsWith("https://") || fp.startsWith("blob:") || fp.startsWith("/")) {
    return fp;
  }
  return `${API_BASE}/music/${music.id}/download`;
}

export default function MusicPlayer({ music, hasPrev, hasNext, onPrev, onNext }: MusicPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [vizMode, setVizMode] = useState<"waveform" | "spectrogram">("waveform");
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

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

  const handleDownload = useCallback(async () => {
    if (!music) return;

    try {
      if (!dirHandleRef.current) {
        dirHandleRef.current = await window.showDirectoryPicker();
      }
      const filename = `${music.title}.wav`;
      const fileHandle = await dirHandleRef.current.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();

      const response = await fetch(resolveAudioUrl(music));
      await response.body?.pipeTo(writable);
    } catch (err) {
      const error = err as Error;
      if (error.name === "AbortError") return;

      // Fallback: simple browser download
      const a = document.createElement("a");
      a.href = resolveAudioUrl(music);
      a.download = `${music.title}.wav`;
      a.click();
    }
  }, [music]);

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
            src={resolveAudioUrl(music)}
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
              <p className="text-sm font-semibold truncate"
                style={{ color: "var(--text-primary)" }}>
                {music.title}
              </p>
              <p className="text-[10px] font-mono tracking-[0.1em] uppercase truncate mt-0.5"
                style={{ color: "var(--accent)" }}>
                {music.styleName}
              </p>
            </div>
            <button className="p-2 transition-colors rounded-full"
              style={{ color: "var(--text-tertiary)" }}
              onClick={handleDownload}
              aria-label="下载音乐">
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
            role="slider"
            aria-label="播放进度"
            aria-valuemin={0}
            aria-valuemax={duration || 100}
            aria-valuenow={currentTime}
            aria-valuetext={formatTime(currentTime)}
            tabIndex={0}
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
              <button
                onClick={onPrev}
                disabled={!hasPrev}
                aria-label="上一首"
                className="p-1.5 transition-colors rounded-full disabled:opacity-30"
                style={{ color: hasPrev ? "var(--text-secondary)" : "var(--text-tertiary)" }}
              >
                <SkipBack size={18} weight="regular" />
              </button>

              <button
                onClick={togglePlay}
                aria-label={isPlaying ? "暂停" : "播放"}
                className="w-12 h-12 rotate-45 flex items-center justify-center transition-all active:scale-90"
                style={{
                  background: "var(--accent)",
                  borderRadius: 10,
                }}
              >
                {isPlaying
                  ? <Pause size={18} weight="fill" className="-rotate-45" style={{ color: "var(--bg-primary)" }} />
                  : <Play size={18} weight="fill" className="-rotate-45 ml-0.5" style={{ color: "var(--bg-primary)" }} />
                }
              </button>

              <button
                onClick={onNext}
                disabled={!hasNext}
                aria-label="下一首"
                className="p-1.5 transition-colors rounded-full disabled:opacity-30"
                style={{ color: hasNext ? "var(--text-secondary)" : "var(--text-tertiary)" }}
              >
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
