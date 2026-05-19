"use client";

import { useState } from "react";
import { Sparkle, ArrowRight, MagicWand, Info, MusicNotes } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import WaveformBars from "./WaveformBars";
import ModelSelector from "./ModelSelector";
import type { ModelInfo } from "@/types";

interface GenerationConsoleProps {
  hasStyle: boolean;
  styleName?: string;
  onGenerate: (prompt: string) => Promise<void>;
  isGenerating: boolean;
  musicGenModel: string;
  onMusicGenModelChange: (model: string) => void;
  musicGenModels: ModelInfo[];
}

const SUGGESTIONS = [
  "一首适合深夜开车的 Lo-Fi 音乐",
  "带有爵士钢琴元素的氛围电子乐",
  "节奏轻快的夏日流行音乐",
  "适合冥想的大自然白噪音",
];

export default function GenerationConsole({
  hasStyle, styleName, onGenerate, isGenerating,
  musicGenModel, onMusicGenModelChange, musicGenModels,
}: GenerationConsoleProps) {
  const [prompt, setPrompt] = useState("");

  const handleGenerate = async () => {
    if (!prompt.trim() || !hasStyle || isGenerating) return;
    await onGenerate(prompt);
  };

  return (
    <div className="card-outer">
      <div className="card-inner p-6 space-y-5 relative overflow-hidden">
        {/* Header */}
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
              <div className="flex items-center gap-2">
                <span className="eyebrow">第 3 步</span>
              </div>
              <h3 className="text-lg italic font-medium"
                style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
                音乐创作
              </h3>
            </div>
          </div>

          {styleName && (
            <span className="eyebrow">
              {styleName}
            </span>
          )}
        </div>

        {/* Disabled hint */}
        {!hasStyle && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
            style={{ background: "var(--accent-soft)", border: "1px solid rgba(212, 168, 83, 0.2)" }}>
            <Info size={16} weight="fill" style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                请先完成前面的步骤
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                先上传音频文件并选择一个风格标签，即可开始创作音乐
              </p>
            </div>
          </div>
        )}

        {/* Model selector */}
        <div className="max-w-xs">
          <ModelSelector
            label="音乐生成模型"
            options={musicGenModels}
            selected={musicGenModel}
            onChange={onMusicGenModelChange}
            disabled={!hasStyle || isGenerating}
            icon={<MusicNotes size={14} style={{ color: "var(--text-tertiary)" }} />}
          />
        </div>

        {/* Textarea */}
        <div className="relative">
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
              : "上传音频并选择风格后即可输入描述"}
            disabled={!hasStyle || isGenerating}
            rows={3}
            className="w-full px-5 py-4 text-sm resize-none transition-all duration-300 disabled:opacity-40"
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

        {/* Suggestions */}
        {hasStyle && !prompt && (
          <div>
            <p className="text-[10px] font-mono tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
              试试这些描述：
            </p>
            <div className="flex gap-2 flex-wrap">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setPrompt(s)}
                  className="btn-ghost"
                >
                  {s.slice(0, 18)}...
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
                <span>AI 生成中，请稍候...</span>
              </motion.span>
            ) : (
              <motion.span key="idle" animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex items-center gap-2">
                <Sparkle size={16} weight="fill" />
                <span>开始生成音乐</span>
                <span className="btn-icon-wrap">
                  <ArrowRight size={16} weight="bold" />
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </button>

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
                推理中
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
