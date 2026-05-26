"use client";

import { useEffect, useState } from "react";
import { MusicNotes, Microphone } from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import PlaylistComponent from "./Playlist";
import MusicPlayer from "./MusicPlayer";
import ErrorBoundary from "./ErrorBoundary";
import { API_BASE, authHeaders } from "@/lib/auth";
import type { GeneratedMusic, Song } from "@/types";

type ArchiveFilter = "all" | "instrumental" | "song" | "vocal";

interface ArchiveWorkspaceProps {
  songs: Song[];
  playlist: GeneratedMusic[];
  vocalGenerations: any[];
  currentPlayingMusic: GeneratedMusic | null;
  currentPlayingId: string | null;
  onPlay: (m: GeneratedMusic) => void;
  onPrev: () => void;
  onNext: () => void;
  currentIndex: number;
}

const FILTERS: { key: ArchiveFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "instrumental", label: "器乐" },
  { key: "song", label: "完整歌曲" },
  { key: "vocal", label: "人声" },
];

function AuthAudio({ src, className, style }: { src: string; className?: string; style?: CSSProperties }) {
  const [audioUrl, setAudioUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    setAudioUrl("");

    (async () => {
      try {
        const res = await fetch(src, { headers: await authHeaders() });
        if (!res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      } catch {
        if (!cancelled) setAudioUrl("");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return <audio controls className={className} src={audioUrl || undefined} style={style} />;
}

export default function ArchiveWorkspace({
  songs, playlist, vocalGenerations,
  currentPlayingMusic, currentPlayingId, onPlay, onPrev, onNext, currentIndex,
}: ArchiveWorkspaceProps) {
  const [filter, setFilter] = useState<ArchiveFilter>("all");

  const hasItems = songs.length > 0 || playlist.length > 0 || vocalGenerations.length > 0;
  const showSongs = filter === "all" || filter === "song";
  const showInstrumental = filter === "all" || filter === "instrumental";
  const showVocal = filter === "all" || filter === "vocal";

  const FILTER_COUNTS: Record<string, number> = {
    all: songs.length + playlist.length + vocalGenerations.length,
    instrumental: playlist.length,
    song: songs.length,
    vocal: vocalGenerations.length,
  };

  const EMPTY_MESSAGES: Record<ArchiveFilter, { title: string; desc: string }> = {
    all: { title: "还没有任何作品", desc: "前往「创作台」生成你的第一个作品" },
    instrumental: { title: "暂无器乐作品", desc: "前往「创作台」→「快速生成」创作器乐音乐" },
    song: { title: "暂无完整歌曲", desc: "前往「创作台」→「完整歌曲」创作带人声的歌曲" },
    vocal: { title: "暂无生成人声", desc: "前往「素材库」→「声音模型」训练模型并生成人声" },
  };

  return (
    <div className="space-y-5">
      <span className="eyebrow mb-2 inline-block">ARCHIVE</span>
      <h2 className="text-3xl italic font-medium mt-1 tracking-tight"
        style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
        作品库
      </h2>
      <div className="flex items-center gap-3 mt-3 mb-5">
        <div className="w-8 h-px" style={{ background: "var(--accent)", opacity: 0.4 }} />
        <div className="w-1 h-1 rotate-45" style={{ background: "var(--accent)", opacity: 0.3 }} />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          回顾所有已生成的作品
        </p>
      </div>

      {/* Filter bar with counts */}
      <div className="flex rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--border-color)", background: "var(--bg-tertiary)", width: "fit-content" }}>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium transition-all duration-300"
            style={{
              background: filter === key ? "var(--accent)" : "transparent",
              color: filter === key ? "var(--bg-primary)" : "var(--text-secondary)",
            }}
          >
            {label}
            <span className="text-[9px] font-mono opacity-60"
              style={{ color: filter === key ? "var(--bg-primary)" : "var(--text-tertiary)" }}>
              {FILTER_COUNTS[key]}
            </span>
          </button>
        ))}
      </div>

      {!hasItems ? (
        <div className="max-w-lg mx-auto py-20 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ border: "1.5px dashed var(--border-color)" }}>
            <MusicNotes size={24} style={{ color: "var(--text-tertiary)" }} />
          </div>
          <p className="text-lg italic" style={{ color: "var(--text-secondary)", fontFamily: "'Playfair Display', serif" }}>
            {EMPTY_MESSAGES[filter].title}
          </p>
          <p className="text-xs mt-2 font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            {EMPTY_MESSAGES[filter].desc}
          </p>
        </div>
      ) : (
        <div className="max-w-3xl space-y-5">
          {/* Songs */}
          {showSongs && (
            songs.length === 0 ? (
              <div className="card-outer">
                <div className="card-inner p-6 text-center">
                  <p className="text-xs italic" style={{ color: "var(--text-secondary)", fontFamily: "'Playfair Display', serif" }}>
                    暂无完整歌曲
                  </p>
                  <p className="text-[9px] mt-1 font-mono" style={{ color: "var(--text-tertiary)" }}>
                    前往「创作台」→「完整歌曲」创作带人声的歌曲
                  </p>
                </div>
              </div>
            ) : (
            <div className="card-outer">
              <div className="card-inner p-5 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <MusicNotes size={14} style={{ color: "var(--accent)" }} />
                  <span className="eyebrow">完整歌曲 ({songs.length})</span>
                </div>
                {songs.slice(0, 10).map((song) => (
                  <div key={song.id} className="flex items-center justify-between py-2"
                    style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <div>
                      <p className="text-sm" style={{ color: "var(--text-primary)" }}>{song.theme}</p>
                      <p className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                        {song.status === "completed"
                          ? <span style={{ color: "#22c55e" }}>{song.hasVocals ? "已合成人声" : "纯伴奏"}</span>
                          : song.status === "failed"
                            ? <span style={{ color: "#ef4444" }}>失败</span>
                            : <span>{song.status}</span>}
                        {" · "}{song.createdAt?.slice(0, 10)}
                      </p>
                    </div>
                    {song.status === "completed" && (
                      <AuthAudio
                        className="h-7"
                        src={`${API_BASE}/song/${song.id}/download`}
                        style={{ maxWidth: "180px" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Playlist / instrumental */}
          {showInstrumental && (
            playlist.length > 0 ? (
              <ErrorBoundary>
                <PlaylistComponent items={playlist} currentPlayingId={currentPlayingId} onPlay={onPlay} />
              </ErrorBoundary>
            ) : (
              <div className="card-outer">
                <div className="card-inner p-6 text-center">
                  <p className="text-xs italic" style={{ color: "var(--text-secondary)", fontFamily: "'Playfair Display', serif" }}>
                    暂无器乐作品
                  </p>
                  <p className="text-[9px] mt-1 font-mono" style={{ color: "var(--text-tertiary)" }}>
                    前往「创作台」→「快速生成」创作器乐音乐
                  </p>
                </div>
              </div>
            )
          )}

          {/* Vocal generations */}
          {showVocal && (
            vocalGenerations.length > 0 ? (
            <div className="card-outer">
              <div className="card-inner p-5 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <Microphone size={14} style={{ color: "var(--accent)" }} />
                  <span className="eyebrow">人声生成 ({vocalGenerations.length})</span>
                </div>
                {vocalGenerations.slice(0, 10).map((gen) => (
                  <div key={gen.id} className="flex items-center justify-between py-2"
                    style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full"
                        style={{ background: gen.status === "completed" ? "#22c55e" : gen.status === "failed" ? "#ef4444" : "#e8a840" }} />
                      <div>
                        <p className="text-xs" style={{ color: "var(--text-primary)" }}>
                          {gen.status === "completed" ? "生成完成" : gen.status === "failed" ? "生成失败" : "处理中"}
                        </p>
                        <p className="text-[9px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                          {gen.durationSeconds > 0 ? `${gen.durationSeconds.toFixed(1)}s` : ""}
                          {gen.createdAt ? ` · ${gen.createdAt.slice(0, 16)}` : ""}
                        </p>
                      </div>
                    </div>
                    {gen.status === "completed" && gen.outputPath && (
                      <AuthAudio
                        className="h-7"
                        src={`${API_BASE}/voice/generations/${gen.id}/download`}
                        style={{ maxWidth: "180px" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
            ) : (
              <div className="card-outer">
                <div className="card-inner p-6 text-center">
                  <p className="text-xs italic" style={{ color: "var(--text-secondary)", fontFamily: "'Playfair Display', serif" }}>
                    暂无生成人声
                  </p>
                  <p className="text-[9px] mt-1 font-mono" style={{ color: "var(--text-tertiary)" }}>
                    前往「素材库」→「声音模型」训练模型并生成人声
                  </p>
                </div>
              </div>
            )
          )}

          {/* Player */}
          {currentPlayingMusic && (
            <ErrorBoundary>
              <MusicPlayer
                music={currentPlayingMusic}
                hasPrev={currentIndex < playlist.length - 1}
                hasNext={currentIndex > 0}
                onPrev={onPrev}
                onNext={onNext}
              />
            </ErrorBoundary>
          )}
        </div>
      )}
    </div>
  );
}
