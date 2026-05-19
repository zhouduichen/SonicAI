"use client";

import { useState } from "react";
import { Intersect, Plus, X, Lightning } from "@phosphor-icons/react";
import type { StyleTag, ModelInfo } from "@/types";
import ModelSelector from "./ModelSelector";

interface BlendPanelProps {
  styles: StyleTag[];
  musicGenModel: string;
  onMusicGenModelChange: (model: string) => void;
  musicGenModels: ModelInfo[];
  onGenerate: (blends: { style_vector_id: number; weight: number }[], prompt: string) => Promise<void>;
  isGenerating: boolean;
}

interface BlendPreset {
  key: string;
  name: string;
  description: string;
  weights: number[];
  num_styles: number;
}

const PRESETS: BlendPreset[] = [
  { key: "equal", name: "均衡融合", description: "各风格等权重", weights: [0.5, 0.5], num_styles: 2 },
  { key: "dominant_a", name: "A主导 (70/30)", description: "第一风格为主", weights: [0.7, 0.3], num_styles: 2 },
  { key: "gentle_blend", name: "渐进过渡 (80/20)", description: "主风格保留", weights: [0.8, 0.2], num_styles: 2 },
  { key: "triangle", name: "三角平衡", description: "三维均衡", weights: [0.34, 0.33, 0.33], num_styles: 3 },
];

export default function BlendPanel({
  styles, musicGenModel, onMusicGenModelChange, musicGenModels, onGenerate, isGenerating,
}: BlendPanelProps) {
  const [selectedStyles, setSelectedStyles] = useState<number[]>([]);
  const [weights, setWeights] = useState<number[]>([0.5, 0.5]);
  const [prompt, setPrompt] = useState("");

  const toggleStyle = (styleId: number) => {
    if (selectedStyles.includes(styleId)) {
      setSelectedStyles(selectedStyles.filter((s) => s !== styleId));
      setWeights(weights.slice(0, -1));
    } else if (selectedStyles.length < 3) {
      const newSelected = [...selectedStyles, styleId];
      setSelectedStyles(newSelected);
      const n = newSelected.length;
      setWeights(Array.from({ length: n }, () => 1.0 / n));
    }
  };

  const setWeight = (index: number, value: number) => {
    const newWeights = [...weights];
    newWeights[index] = value;
    setWeights(newWeights);
  };

  const applyPreset = (preset: BlendPreset) => {
    if (selectedStyles.length < preset.num_styles) return;
    setWeights([...preset.weights]);
  };

  const normalizeWeights = () => {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total > 0) setWeights(weights.map((w) => w / total));
  };

  const handleGenerate = async () => {
    if (selectedStyles.length < 2 || !prompt.trim()) return;
    normalizeWeights();
    const blends = selectedStyles.map((id, i) => ({
      style_vector_id: id,
      weight: weights[i] || 0,
    }));
    await onGenerate(blends, prompt);
  };

  const totalWeight = weights.reduce((a, b) => a + b, 0);

  return (
    <div className="card-outer">
      <div className="card-inner p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Intersect size={18} style={{ color: "var(--accent)" }} />
          <h3 className="text-lg italic font-medium" style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
            Style Blend
          </h3>
          <span className="eyebrow">混合创作</span>
        </div>

        {/* Style selection */}
        <div>
          <p className="text-xs font-mono tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
            选择 2-3 个风格标签
          </p>
          <div className="flex gap-2 flex-wrap">
            {styles.map((s) => {
              const active = selectedStyles.includes(Number(s.id));
              return (
                <button
                  key={s.id}
                  onClick={() => toggleStyle(Number(s.id))}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: active ? "var(--accent-soft)" : "var(--bg-tertiary)",
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                    border: active ? "1px solid var(--accent)" : "1px solid var(--border-color)",
                  }}
                >
                  {s.name}
                  {active && <X size={10} className="inline ml-1" />}
                  {!active && <Plus size={10} className="inline ml-1" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Weight sliders */}
        {selectedStyles.length >= 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                混合比例 (总: {Math.round(totalWeight * 100)}%)
              </p>
              <button
                onClick={normalizeWeights}
                className="text-[10px] font-mono px-2 py-0.5 rounded"
                style={{ color: "var(--accent)", border: "1px solid var(--accent)" }}
              >
                归一化
              </button>
            </div>

            {selectedStyles.map((styleId, i) => {
              const style = styles.find((s) => Number(s.id) === styleId);
              const pct = Math.round(((weights[i] || 0) / Math.max(totalWeight, 1)) * 100);
              return (
                <div key={styleId} className="flex items-center gap-3">
                  <span className="text-xs w-20 truncate" style={{ color: "var(--text-primary)" }}>
                    {style?.name || `风格${i + 1}`}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={pct}
                    onChange={(e) => setWeight(i, Number(e.target.value) / 100)}
                    className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span className="text-xs font-mono w-10 text-right" style={{ color: "var(--accent)" }}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Presets */}
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p)}
              disabled={selectedStyles.length < p.num_styles}
              className="px-2 py-1 text-[10px] font-mono rounded transition-all"
              style={{
                background: "var(--bg-tertiary)",
                color: selectedStyles.length >= p.num_styles ? "var(--text-secondary)" : "var(--text-tertiary)",
                border: "1px solid var(--border-color)",
                opacity: selectedStyles.length >= p.num_styles ? 1 : 0.4,
              }}
            >
              <Lightning size={9} className="inline mr-1" />
              {p.name}
            </button>
          ))}
        </div>

        {/* Model + Prompt */}
        <div className="space-y-3">
          <ModelSelector
            label="生成模型"
            options={musicGenModels}
            selected={musicGenModel}
            onChange={onMusicGenModelChange}
            disabled={isGenerating}
          />

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想要的混合风格音乐..."
            disabled={isGenerating}
            rows={2}
            className="w-full rounded-xl px-4 py-2.5 text-sm resize-none transition-all"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
            }}
          />

          <button
            onClick={handleGenerate}
            disabled={selectedStyles.length < 2 || !prompt.trim() || isGenerating}
            className="btn-primary w-full text-xs"
          >
            <Intersect size={14} />
            <span>{isGenerating ? "生成中..." : "融合生成"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
