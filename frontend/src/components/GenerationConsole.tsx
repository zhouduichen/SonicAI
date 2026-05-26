"use client";

import { useState, useEffect } from "react";
import { Sparkle, ArrowRight, MagicWand, Shuffle, MusicNotes, Waveform } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import WaveformBars from "./WaveformBars";
import ModelSelector from "./ModelSelector";
import type { ModelInfo } from "@/types";

interface GenerationConsoleProps {
  hasStyle: boolean;
  styleName?: string;
  styleCreatedAt?: string;
  styleModel?: string;
  onGenerate: (prompt: string) => Promise<void>;
  isGenerating: boolean;
  musicGenModel: string;
  onMusicGenModelChange: (model: string) => void;
  musicGenModels: ModelInfo[];
  suggestions: string[];
  suggestionsLoading: boolean;
  onRefreshSuggestions?: () => void;
  /** When set, pre-fills the prompt */
  initialPrompt?: string;
  /** Increment to re-apply initialPrompt even if text is the same */
  regenerateKey?: number;
}

const GEN_STAGES = ["读取风格", "解释描述", "渲染音频"];

export default function GenerationConsole({
  hasStyle, styleName, styleCreatedAt, styleModel, onGenerate, isGenerating,
  musicGenModel, onMusicGenModelChange, musicGenModels,
  suggestions, suggestionsLoading, onRefreshSuggestions, initialPrompt, regenerateKey,
}: GenerationConsoleProps) {
  const [prompt, setPrompt] = useState("");

  // Pre-fill prompt when initialPrompt changes (e.g. from regenerate button)
  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt, regenerateKey]);
  const [genStage, setGenStage] = useState(0);

  const handleGenerate = async () => {
    if (!prompt.trim() || !hasStyle || isGenerating) return;
    // Animate through stages (visual-only, doesn't affect backend)
    setGenStage(0);
    const stageInterval = setInterval(() => {
      setGenStage((s) => {
        if (s >= 2) { clearInterval(stageInterval); return 2; }
        return s + 1;
      });
    }, 2000);
    try {
      await onGenerate(prompt);
    } finally {
      clearInterval(stageInterval);
      setGenStage(3); // all done
      setTimeout(() => setGenStage(0), 800);
    }
  };

  return (
    <div className="card-outer">
      <div className="card-inner p-6 space-y-5 relative overflow-hidden">
        {/* Prompt Composer Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rotate-45 flex items-center justify-center"
              style={{
                border: "1.5px solid var(--accent)",
                borderRadius: 6,
              }}>
              <MagicWand size={14} weight="fill" className="-rotate-45" style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <span className="eyebrow">作曲器</span>
              <h3 className="text-lg italic font-medium"
                style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
                音乐创作
              </h3>
            </div>
          </div>

          {/* Style badge */}
          {styleName && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono"
              style={{
                background: "var(--accent-soft)",
                border: "1px solid rgba(212, 168, 83, 0.2)",
                color: "var(--accent)",
              }}>
              <Waveform size={10} />
              {styleName}
            </span>
          )}
        </div>

        {/* Disabled hint */}
        {!hasStyle && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
            style={{ background: "var(--accent-soft)", border: "1px solid rgba(212, 168, 83, 0.2)" }}>
            <Sparkle size={16} weight="fill" style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                选择一个风格开始创作
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                从上方风格库中点击选择，或前往「素材库」上传音频
              </p>
            </div>
          </div>
        )}

        {/* Model and processing info bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-xs">
            <ModelSelector
              label="生成模型"
              options={musicGenModels}
              selected={musicGenModel}
              onChange={onMusicGenModelChange}
              disabled={!hasStyle || isGenerating}
              icon={<MusicNotes size={14} style={{ color: "var(--text-tertiary)" }} />}
            />
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: hasStyle ? "#22c55e" : "var(--text-tertiary)" }} />
            <span className="text-[9px] font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              风格 {hasStyle ? "已选" : "未选"}
            </span>
          </div>
        </div>

        {/* Prompt input with style badge */}
        <div className="relative">
          <label className="text-[10px] font-mono tracking-[0.1em] uppercase mb-1.5 block" style={{ color: "var(--text-tertiary)" }}>
            音乐描述
          </label>
          <div className="relative">
            {styleName && hasStyle && (
              <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-md"
                style={{ background: "var(--accent-soft)", border: "1px solid rgba(212,168,83,0.2)" }}>
                <Waveform size={10} style={{ color: "var(--accent)" }} />
                <span className="text-[9px] font-mono" style={{ color: "var(--accent)" }}>{styleName}</span>
              </div>
            )}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder={hasStyle
                ? "用文字描述你想要的音乐... 例如：「一首适合雨中漫步的钢琴曲」"
                : "选择风格后即可输入描述"}
              disabled={!hasStyle || isGenerating}
              rows={3}
              className={`w-full px-5 py-4 text-sm resize-none transition-all duration-300 disabled:opacity-40 ${styleName && hasStyle ? 'pt-12' : ''}`}
              style={{
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
                outline: "none",
                borderRadius: 12,
                fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif",
              }}
              onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--border-color)"; }}
            />
            <div className="absolute left-0 top-3 bottom-3 w-0.5"
              style={{
                background: "var(--accent)",
                opacity: prompt ? 0.4 : 0.1,
                transition: "opacity 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
              }} />
          </div>
        </div>

        {/* Inspiration suggestions */}
        {hasStyle && !prompt && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                {suggestionsLoading ? "正在生成建议..." : "灵感片段"}
              </p>
              {onRefreshSuggestions && !suggestionsLoading && (
                <button onClick={onRefreshSuggestions}
                  className="flex items-center gap-1 text-[9px] font-mono tracking-wider transition-colors"
                  style={{ color: "var(--text-tertiary)" }}>
                  <Shuffle size={10} /> 换一批
                </button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {suggestions.map((s) => (
                <button key={s} onClick={() => setPrompt(s)} className="inspiration-chip">
                  <Sparkle size={10} style={{ color: "var(--accent)", opacity: 0.5 }} />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || !hasStyle || isGenerating}
          className="btn-primary w-full text-sm"
        >
          <AnimatePresence mode="wait">
            {isGenerating ? (
              <motion.span key="gen" animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex items-center gap-3">
                <WaveformBars />
                <span>AI 生成中</span>
              </motion.span>
            ) : (
              <motion.span key="idle" animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex items-center gap-2">
                <Sparkle size={16} weight="fill" />
                <span>生成音乐</span>
                <span className="btn-icon-wrap">
                  <ArrowRight size={16} weight="bold" />
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Generation Progress Timeline */}
        <AnimatePresence>
          {isGenerating && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="gen-timeline" style={{ borderTop: "1px solid var(--border-color)", paddingTop: 16, marginTop: -8 }}>
              {GEN_STAGES.map((stage, i) => {
                const state = genStage > i ? "done" : genStage === i ? "active" : "pending";
                return (
                  <div key={stage} className="timeline-row">
                    <div className={`timeline-dot ${state}`} />
                    <span className={`timeline-label ${state}`}>{stage}</span>
                    {state === "active" && (
                      <motion.span className="text-[8px] font-mono" style={{ color: "var(--accent)" }}
                        animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                        ...
                      </motion.span>
                    )}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress bar */}
        <AnimatePresence>
          {isGenerating && (
            <motion.div animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3">
              <div className="flex-1 h-0.5 overflow-hidden rounded-full" style={{ background: "var(--bg-tertiary)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "var(--accent)", width: "35%" }}
                  animate={{ x: ["-100%", "300%"] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                />
              </div>
              <span className="text-[10px] font-mono tracking-[0.1em] uppercase"
                style={{ color: "var(--text-tertiary)" }}>
                {GEN_STAGES[Math.min(genStage, 2)]}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
