"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MagicWand, Intersect, MusicNotes, Disc, Waveform, Clock, Note } from "@phosphor-icons/react";
import GenerationConsole from "./GenerationConsole";
import BlendPanel from "./BlendPanel";
import SongCreator from "./SongCreator";
import MusicPlayer from "./MusicPlayer";
import Playlist from "./Playlist";
import ErrorBoundary from "./ErrorBoundary";
import ModelProfileSwitcher from "./ModelProfileSwitcher";
import type { StyleTag, GeneratedMusic, ModelInfo, VoiceModel, Song, ProcessingMode, HardwareTier, PreferenceMode } from "@/types";

type CreationMode = "quick" | "blend" | "song";

interface CreationWorkspaceProps {
  mode: CreationMode;
  onModeChange: (m: CreationMode) => void;
  styles: StyleTag[];
  selectedStyle: StyleTag | null;
  onStyleSelect: (s: StyleTag | null) => void;
  onGenerate: (prompt: string) => Promise<void>;
  isGenerating: boolean;
  musicGenModel: string;
  onMusicGenModelChange: (m: string) => void;
  musicGenModels: ModelInfo[];
  suggestions: string[];
  suggestionsLoading: boolean;
  onRefreshSuggestions?: () => void;
  onBlendGenerate: (blends: { style_vector_id: number; weight: number }[], prompt: string) => Promise<void>;
  isBlendGenerating: boolean;
  blendMusicGenModel: string;
  onBlendMusicGenModelChange: (m: string) => void;
  voiceModels: VoiceModel[];
  songs: Song[];
  processingMode: ProcessingMode;
  onSongCreated: (song: Song) => void;
  playlist: GeneratedMusic[];
  currentPlayingMusic: GeneratedMusic | null;
  currentPlayingId: string | null;
  onPlay: (m: GeneratedMusic) => void;
  onPrev: () => void;
  onNext: () => void;
  currentIndex: number;
  /** Hardware tier + preference for model profile switcher */
  hardwareTier: HardwareTier;
  preference: PreferenceMode;
  onPreferenceChange: (mode: PreferenceMode) => void;
}

const MODES: { key: CreationMode; label: string; icon: React.ElementType }[] = [
  { key: "quick", label: "快速生成", icon: MagicWand },
  { key: "blend", label: "风格融合", icon: Intersect },
  { key: "song", label: "完整歌曲", icon: MusicNotes },
];

export default function CreationWorkspace({
  mode, onModeChange,
  styles, selectedStyle, onStyleSelect,
  onGenerate, isGenerating, musicGenModel, onMusicGenModelChange, musicGenModels,
  suggestions, suggestionsLoading, onRefreshSuggestions,
  onBlendGenerate, isBlendGenerating, blendMusicGenModel, onBlendMusicGenModelChange,
  voiceModels, songs, processingMode, onSongCreated,
  playlist, currentPlayingMusic, currentPlayingId, onPlay, onPrev, onNext, currentIndex,
  hardwareTier, preference, onPreferenceChange,
}: CreationWorkspaceProps) {
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [regenerateKey, setRegenerateKey] = useState(0);
  const [regeneratePrompt, setRegeneratePrompt] = useState("");

  const handleStyleSelect = useCallback((style: StyleTag) => {
    onStyleSelect(style);
    setShowStylePicker(false);
  }, [onStyleSelect]);

  // Handle regenerate: pre-fill prompt and auto-generate
  const handleRegenerate = useCallback((music: GeneratedMusic) => {
    setRegeneratePrompt(music.prompt);
    setRegenerateKey((k) => k + 1);
    // Auto-trigger generation after a brief delay to let the prompt render
    setTimeout(() => {
      onGenerate(music.prompt);
    }, 100);
  }, [onGenerate]);

  // Derive extra style info if available
  const styleMeta = useMemo(() => {
    if (!selectedStyle) return null;
    return {
      createdAt: selectedStyle.createdAt || "",
      model: selectedStyle.styleExtractModel || "",
      sourceAudio: "",
    };
  }, [selectedStyle]);

  return (
    <div className="space-y-5">
      {/* Header + Mode switcher */}
      <div>
        <span className="eyebrow mb-2 inline-block">CREATION</span>
        <h2 className="text-3xl italic font-medium mt-1 tracking-tight"
          style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
          AI 音乐创作
        </h2>
        <div className="flex items-center gap-3 mt-3 mb-5">
          <div className="w-8 h-px" style={{ background: "var(--accent)", opacity: 0.4 }} />
          <div className="w-1 h-1 rotate-45" style={{ background: "var(--accent)", opacity: 0.3 }} />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {mode === "quick" ? "选择风格 → 输入描述 → 生成器乐" :
             mode === "blend" ? "融合多风格特征，生成全新混合音乐" :
             "输入主题 → AI 自动写词、编曲、人声、混音"}
          </p>
        </div>

        {/* Model profile switcher — 快速 / 平衡 / 高质量 */}
        <div className="mb-4 max-w-xl">
          <ModelProfileSwitcher
            tier={hardwareTier}
            preference={preference}
            onChange={onPreferenceChange}
          />
        </div>

        {/* Mode segmented control */}
        <div className="flex rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--border-color)", background: "var(--bg-tertiary)", width: "fit-content" }}>
          {MODES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onModeChange(key)}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-medium transition-all duration-300"
              style={{
                background: mode === key ? "var(--accent)" : "transparent",
                color: mode === key ? "var(--bg-primary)" : "var(--text-secondary)",
              }}
            >
              <Icon size={14} weight={mode === key ? "fill" : "regular"} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── Quick Generate ── */}
        {mode === "quick" && (
          <motion.div key="quick" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-2 space-y-5">
                {/* Enhanced Style Preview */}
                <div className="card-outer">
                  <div className="card-inner p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rotate-45 flex items-center justify-center"
                          style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 6 }}>
                          <Disc size={12} weight="fill" className="-rotate-45" style={{ color: "var(--accent)" }} />
                        </div>
                        <h3 className="text-sm italic font-medium"
                          style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
                          采样源
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono tracking-[0.15em]"
                        style={{ color: "var(--text-tertiary)" }}>
                        {styles.length} 个风格
                      </span>
                    </div>

                    {styles.length === 0 ? (
                      <div className="py-6 text-center">
                        <div className="w-12 h-12 mx-auto mb-3 rotate-45 flex items-center justify-center"
                          style={{ border: "1.5px dashed var(--border-color)", borderRadius: 8 }}>
                          <Note size={18} className="-rotate-45" style={{ color: "var(--text-tertiary)" }} />
                        </div>
                        <p className="text-sm italic" style={{ color: "var(--text-secondary)", fontFamily: "'Playfair Display', serif" }}>
                          准备开始创作
                        </p>
                        <p className="text-xs mt-1 font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                          前往「素材库」上传音频提取风格
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {styles.map((s) => {
                          const active = selectedStyle?.id === s.id;
                          const sourceName = (s as any).source_audio_name || "";
                          const modelName = (s as any).model || "";
                          return (
                            <div key={s.id}
                              onClick={() => onStyleSelect(active ? null : s)}
                              className="group flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-lg transition-all duration-200"
                              style={{
                                background: active ? "var(--accent-soft)" : "transparent",
                                border: active ? "1px solid var(--accent)" : "1px solid transparent",
                              }}
                            >
                              <div className="w-7 h-7 flex items-center justify-center shrink-0"
                                style={{
                                  background: active ? "var(--accent)" : "var(--bg-tertiary)",
                                  borderRadius: 6,
                                  transition: "background 0.25s ease",
                                }}>
                                <Waveform size={12} weight={active ? "fill" : "regular"}
                                  style={{ color: active ? "#0d0d0d" : "var(--text-tertiary)" }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate"
                                  style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}>
                                  {s.name}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {sourceName && (
                                    <span className="style-detail-tag">
                                      <Waveform size={7} /> {sourceName.slice(0, 12)}
                                    </span>
                                  )}
                                  {modelName && (
                                    <span className="style-detail-tag">{modelName.slice(0, 10)}</span>
                                  )}
                                </div>
                              </div>
                              {active && (
                                <span className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                                  style={{ background: "var(--accent)", color: "#0d0d0d" }}>
                                  当前
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-3 space-y-5">
                <ErrorBoundary>
                  <GenerationConsole
                    hasStyle={!!selectedStyle}
                    styleName={selectedStyle?.name}
                    styleCreatedAt={styleMeta?.createdAt}
                    styleModel={styleMeta?.model}
                    isGenerating={isGenerating}
                    onGenerate={onGenerate}
                    musicGenModel={musicGenModel}
                    onMusicGenModelChange={onMusicGenModelChange}
                    musicGenModels={musicGenModels}
                    suggestions={suggestions}
                    suggestionsLoading={suggestionsLoading}
                    onRefreshSuggestions={onRefreshSuggestions}
                    initialPrompt={regeneratePrompt}
                    regenerateKey={regenerateKey}
                  />
                </ErrorBoundary>
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
                <ErrorBoundary>
                  <Playlist items={playlist} currentPlayingId={currentPlayingId} onPlay={onPlay} onRegenerate={handleRegenerate} />
                </ErrorBoundary>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Blend ── */}
        {mode === "blend" && (
          <motion.div key="blend" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }} className="max-w-2xl space-y-5">
            <ErrorBoundary>
              <BlendPanel
                styles={styles}
                musicGenModel={blendMusicGenModel}
                onMusicGenModelChange={onBlendMusicGenModelChange}
                musicGenModels={musicGenModels}
                onGenerate={onBlendGenerate}
                isGenerating={isBlendGenerating}
              />
            </ErrorBoundary>
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
          </motion.div>
        )}

        {/* ── Song ── */}
        {mode === "song" && (
          <motion.div key="song" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }} className="max-w-2xl space-y-5">
            <ErrorBoundary>
              <SongCreator
                voiceModels={voiceModels}
                styles={styles}
                selectedStyle={selectedStyle}
                onStyleSelect={onStyleSelect}
                playlist={playlist}
                onSongCreated={onSongCreated}
                processingMode={processingMode}
              />
            </ErrorBoundary>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
