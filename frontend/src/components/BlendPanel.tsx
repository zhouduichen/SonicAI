"use client";

import { useState, useEffect } from "react";
import { Intersect, Plus, X, Lightning } from "@phosphor-icons/react";
import type { StyleTag, ModelInfo } from "@/types";
import ModelSelector from "./ModelSelector";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

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

const FALLBACK_PRESETS: BlendPreset[] = [
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
  const [presets, setPresets] = useState<BlendPreset[]>(FALLBACK_PRESETS);
  const [hoveredPreset, setHoveredPreset] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/music/blend-presets`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data) && data.length > 0) {
          setPresets(data as BlendPreset[]);
        }
      })
      .catch(() => {}); // keep fallback
  }, []);

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
                  aria-pressed={active}
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
                  <label className="text-xs w-20 truncate" style={{ color: "var(--text-primary)" }}>
                    {style?.name || `风格${i + 1}`}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={pct}
                    onChange={(e) => setWeight(i, Number(e.target.value) / 100)}
                    aria-label={`${style?.name || `风格${i + 1}`} 混合比例`}
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
          {presets.map((p) => {
            const isDisabled = selectedStyles.length < p.num_styles;
            return (
              <button
                key={p.key}
                onClick={() => applyPreset(p)}
                disabled={isDisabled}
                onMouseEnter={() => setHoveredPreset(p.key)}
                onMouseLeave={() => setHoveredPreset(null)}
                className="px-2 py-1 text-[10px] font-mono rounded transition-all"
                style={{
                  background: hoveredPreset === p.key ? "var(--accent-soft)" : "var(--bg-tertiary)",
                  color: isDisabled ? "var(--text-tertiary)" : hoveredPreset === p.key ? "var(--accent)" : "var(--text-secondary)",
                  border: hoveredPreset === p.key ? "1px solid var(--accent)" : "1px solid var(--border-color)",
                  opacity: isDisabled ? 0.4 : 1,
                }}
              >
                <Lightning size={9} className="inline mr-1" />
                {p.name}
              </button>
            );
          })}
        </div>

        {/* Preset hover preview */}
        {hoveredPreset && (
          <div
            className="rounded-xl p-3 text-[10px] space-y-1.5 transition-all"
            style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
            }}
          >
            {(() => {
              const preset = presets.find((p) => p.key === hoveredPreset)!;
              return (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-mono" style={{ color: "var(--text-primary)" }}>{preset.name}</span>
                    <span style={{ color: "var(--text-tertiary)" }}>需要 {preset.num_styles} 个风格</span>
                  </div>
                  <p style={{ color: "var(--text-tertiary)" }}>{preset.description}</p>
                  <div className="flex gap-1 flex-wrap pt-1">
                    {preset.weights.map((w, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-full font-mono"
                        style={{
                          background: "var(--accent-soft)",
                          color: "var(--accent)",
                        }}
                      >
                        #{i + 1}: {Math.round(w * 100)}%
                      </span>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        )}

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
