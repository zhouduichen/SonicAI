"use client";

import { useState, useEffect } from "react";
import { MusicNotes, Spinner } from "@phosphor-icons/react";
import type { Song, VoiceModel, StyleTag, GeneratedMusic } from "@/types";

const STEP_LABELS: Record<string, string> = {
  writing: "写词中...",
  arranging: "编曲中...",
  singing: "人声中...",
  mixing: "混音中...",
  completed: "完成!",
  failed: "失败",
};

interface SongCreatorProps {
  voiceModels: VoiceModel[];
  styles: StyleTag[];
  selectedStyle: StyleTag | null;
  onStyleSelect: (style: StyleTag | null) => void;
  playlist: GeneratedMusic[];
  onSongCreated: (song: Song) => void;
}

export default function SongCreator({ voiceModels, styles, selectedStyle, onStyleSelect, playlist, onSongCreated }: SongCreatorProps) {
  const [theme, setTheme] = useState("");
  const [voiceModelId, setVoiceModelId] = useState("");
  const [styleVectorId, setStyleVectorId] = useState("");
  const [referenceMusicId, setReferenceMusicId] = useState("");
  const [creating, setCreating] = useState(false);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);

  useEffect(() => {
    if (selectedStyle) {
      setStyleVectorId(selectedStyle.id);
    }
  }, [selectedStyle?.id]);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

  const handleCreate = async () => {
    if (!theme.trim()) return;
    setCreating(true);
    setCurrentSong(null);
    try {
      const token = localStorage.getItem("sonicai_token") || "";
      const res = await fetch(`${API_BASE}/song/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          theme: theme.trim(),
          voice_model_id: voiceModelId ? Number(voiceModelId) : null,
          style_vector_id: styleVectorId ? Number(styleVectorId) : null,
          reference_audio_id: referenceMusicId ? Number(referenceMusicId) : null,
        }),
      });
      if (!res.ok) throw new Error("Creation failed");
      const { song_id } = await res.json();

      const interval = setInterval(async () => {
        try {
          const sr = await fetch(`${API_BASE}/song/status/${song_id}`);
          if (!sr.ok) return;
          const song: Song = await sr.json();
          setCurrentSong(song);
          if (song.status === "completed" || song.status === "failed") {
            clearInterval(interval);
            setCreating(false);
            if (song.status === "completed") onSongCreated(song);
          }
        } catch { /* keep polling */ }
      }, 2000);
    } catch {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="card-outer">
        <div className="card-inner p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="eyebrow">创作</span>
            <h3 className="text-lg italic font-medium"
              style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
              歌曲创作
            </h3>
          </div>

          <div>
            <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
              歌曲主题
            </p>
            <textarea
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="例如：关于夏天的离别、对未来的期待..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm resize-none"
              style={{
                background: "var(--bg-primary)", border: "1px solid var(--border-color)",
                color: "var(--text-primary)", outline: "none",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            />
          </div>

          <div>
            <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
              风格标签（可选）
            </p>
            <select
              value={styleVectorId}
              onChange={(e) => {
                setStyleVectorId(e.target.value);
                const found = styles.find((s) => s.id === e.target.value);
                onStyleSelect(found || null);
              }}
              disabled={styles.length === 0}
              className="settings-select"
              style={{ padding: "8px 36px 8px 12px", fontSize: "0.8125rem" }}
            >
              <option value="">
                {styles.length === 0 ? "暂无可用风格..." : "不指定风格（纯即兴编曲）..."}
              </option>
              {styles.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.embedding.length}维)</option>
              ))}
            </select>
            {styles.length === 0 && (
              <p className="text-[9px] mt-1 opacity-60" style={{ color: "var(--text-tertiary)" }}>
                请先在「创作工作室」上传音频提取风格标签
              </p>
            )}
          </div>

          <div>
            <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
              参考音频（可选）
            </p>
            <select
              value={referenceMusicId}
              onChange={(e) => setReferenceMusicId(e.target.value)}
              disabled={playlist.length === 0}
              className="settings-select"
              style={{ padding: "8px 36px 8px 12px", fontSize: "0.8125rem" }}
            >
              <option value="">
                {playlist.length === 0 ? "暂无已生成的音乐..." : "无参考音频..."}
              </option>
              {playlist.map((m) => (
                <option key={m.id} value={m.id}>{m.title} — {m.styleName}</option>
              ))}
            </select>
            {playlist.length === 0 && (
              <p className="text-[9px] mt-1 opacity-60" style={{ color: "var(--text-tertiary)" }}>
                请先在「创作工作室」生成器乐作品
              </p>
            )}
          </div>

          <div>
            <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
              声音模型（可选）
            </p>
            <select
              value={voiceModelId}
              onChange={(e) => setVoiceModelId(e.target.value)}
              className="settings-select"
              style={{ padding: "8px 36px 8px 12px", fontSize: "0.8125rem" }}
            >
              <option value="">纯器乐（没有人声）...</option>
              {voiceModels.map((m) => (
                <option key={m.id} value={m.id} disabled={m.status !== "ready"}>
                  {m.name}{m.status !== "ready" ? ` (${m.status === "pending" ? "未训练" : m.status})` : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleCreate}
            disabled={!theme.trim() || creating}
            className="btn-primary w-full text-sm"
          >
            <span className="flex items-center justify-center gap-2">
              {creating ? <Spinner size={16} className="animate-spin" /> : <MusicNotes size={16} />}
              {creating ? "创作中..." : "开始创作"}
            </span>
          </button>
        </div>
      </div>

      {currentSong && (
        <div className="card-outer">
          <div className="card-inner p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="eyebrow">{STEP_LABELS[currentSong.status] || currentSong.status}</span>
            </div>

            {currentSong.lyrics && (
              <div className="space-y-2">
                <p className="text-[10px] font-mono tracking-[0.1em]" style={{ color: "var(--text-tertiary)" }}>
                  歌词
                </p>
                <div className="p-4 rounded-xl text-sm leading-relaxed whitespace-pre-line"
                  style={{
                    background: "var(--bg-primary)", color: "var(--text-secondary)",
                    fontFamily: "'Plus Jakarta Sans', sans-serif", border: "1px solid var(--border-color)",
                  }}>
                  {currentSong.lyrics}
                </div>
              </div>
            )}

            {currentSong.status !== "completed" && currentSong.status !== "failed" && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {STEP_LABELS[currentSong.status]}
                </span>
              </div>
            )}

            {currentSong.status === "completed" && (
              <div>
                <p className="text-sm" style={{ color: "#22c55e" }}>创作完成!</p>
                {currentSong.mixedPath && (
                  <audio controls className="w-full mt-3" src={currentSong.mixedPath} />
                )}
              </div>
            )}

            {currentSong.status === "failed" && (
              <p className="text-sm" style={{ color: "#ef4444" }}>创作失败，请重试</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
