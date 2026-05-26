"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Download, Waveform, ChartBar } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import type { GeneratedMusic } from "@/types";
import WaveformViewer from "./WaveformViewer";
import MockBadge from "./MockBadge";
import { API_BASE, getToken } from "@/lib/auth";

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
  if (fp.startsWith("http://") || fp.startsWith("https://") || fp.startsWith("blob:")) {
    return fp;
  }
  return `${API_BASE}/music/${music.id}/download`;
}

function shouldSendAuth(url: string): boolean {
  return url.startsWith(API_BASE) || (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("blob:"));
}

function makeDownloadName(title: string): string {
  return `${title.replace(/[\\/:*?"<>|]/g, "_") || "sonicai-track"}.wav`;
}

export default function MusicPlayer({ music, hasPrev, hasNext, onPrev, onNext }: MusicPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [vizMode, setVizMode] = useState<"waveform" | "spectrogram">("waveform");
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Fetch audio with auth token and create blob URL
  useEffect(() => {
    if (!music) {
      setAudioUrl("");
      return;
    }
    let cancelled = false;
    const sourceUrl = resolveAudioUrl(music);

    (async () => {
      try {
        const token = shouldSendAuth(sourceUrl) ? await getToken() : null;
        const res = await fetch(sourceUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error("Failed to fetch audio");
        const blob = await res.blob();
        const nextUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = nextUrl;
        setAudioUrl(nextUrl);
      } catch {
        if (!cancelled) {
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
          }
          setAudioUrl(sourceUrl);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [music]);

  // Sync playback speed
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  // Cleanup on music change
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAnalyserNode(null);
    setPlaybackSpeed(1);
    if (audioCtxRef.current?.state !== "closed") {
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, [music?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const audioCtx = audioCtxRef.current;
      if (audioCtx && audioCtx.state !== "closed") {
        audioCtx.close().catch(() => {});
      }
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioCtxRef.current) {
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        const source = ctx.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(ctx.destination);
        setAnalyserNode(analyser);
      } catch {
        // Plain HTML5 audio fallback
      }
    } else if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleDownload = useCallback(async () => {
    if (!music) return;
    const sourceUrl = resolveAudioUrl(music);
    const filename = makeDownloadName(music.title);
    let objectUrl: string | null = null;

    try {
      const token = shouldSendAuth(sourceUrl) ? await getToken() : null;
      const response = await fetch(sourceUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();

      if (!dirHandleRef.current) {
        dirHandleRef.current = await window.showDirectoryPicker();
      }
      const fileHandle = await dirHandleRef.current.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await blob.stream().pipeTo(writable);
    } catch (err) {
      const error = err as Error;
      if (error.name === "AbortError") return;

      // Fallback: simple browser download
      objectUrl = audioUrl.startsWith("blob:") ? audioUrl : null;
      const a = document.createElement("a");
      a.href = objectUrl || sourceUrl;
      a.download = filename;
      a.click();
    }
  }, [audioUrl, music]);

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
            src={audioUrl || resolveAudioUrl(music)}
            preload="auto"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
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
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold truncate"
                  style={{ color: "var(--text-primary)" }}>
                  {music.title}
                </p>
                {music.providerMode === "mock" && (
                  <MockBadge music={music} variant="full" />
                )}
              </div>
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

          {/* Playback speed */}
          <div className="flex items-center justify-center gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setPlaybackSpeed(s)}
                className="px-2 py-0.5 rounded text-[9px] font-mono transition-all"
                style={{
                  background: playbackSpeed === s ? "var(--accent-soft)" : "var(--bg-tertiary)",
                  color: playbackSpeed === s ? "var(--accent)" : "var(--text-tertiary)",
                  border: playbackSpeed === s ? "1px solid var(--accent)" : "1px solid transparent",
                }}
              >
                {s}x
              </button>
            ))}
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
