"use client";

import { X, Gear } from "@phosphor-icons/react";
import type { HardwareTier, PreferenceMode, ModelInfo } from "@/types";
import { HARDWARE_TIERS, getTierConfig, getEstimatedTime } from "@/lib/hardware-tiers";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  tier: HardwareTier;
  onTierChange: (tier: HardwareTier) => void;
  preference: PreferenceMode;
  onPreferenceChange: (mode: PreferenceMode) => void;
  vocalSepModels: ModelInfo[];
  styleExtractModels: ModelInfo[];
  musicGenModels: ModelInfo[];
  vocalSepModel: string;
  styleExtractModel: string;
  musicGenModel: string;
  onVocalSepModelChange: (key: string) => void;
  onStyleExtractModelChange: (key: string) => void;
  onMusicGenModelChange: (key: string) => void;
}

function getModelVram(models: ModelInfo[], key: string): number {
  return models.find((m) => m.key === key)?.vram_gb ?? 0;
}

function getModelTimeEstimate(models: ModelInfo[], key: string): string {
  const m = models.find((m) => m.key === key);
  if (!m) return "?";
  const speedMap: Record<string, string> = { "很快": "~10s", "快": "~20s", "中等": "~40s", "较慢": "~60s", "慢": "~90s" };
  return speedMap[m.speed] ?? "~40s";
}

const TIER_LABELS: Record<HardwareTier, string> = {
  ultra: "旗舰 (16G+)",
  high: "高端 (12G+)",
  mid: "中端 (8G+)",
  low: "入门 (6G+)",
  cpu: "CPU (无独显)",
};

export default function SettingsPanel({
  open,
  onClose,
  tier,
  onTierChange,
  preference,
  onPreferenceChange,
  vocalSepModels,
  styleExtractModels,
  musicGenModels,
  vocalSepModel,
  styleExtractModel,
  musicGenModel,
  onVocalSepModelChange,
  onStyleExtractModelChange,
  onMusicGenModelChange,
}: SettingsPanelProps) {
  const config = getTierConfig(tier);
  const maxVram = config.maxVramGB;
  const totalVram = Math.max(
    getModelVram(vocalSepModels, vocalSepModel),
    getModelVram(styleExtractModels, styleExtractModel),
    getModelVram(musicGenModels, musicGenModel)
  );
  const vramWarning = totalVram > maxVram;
  const estTime = getEstimatedTime(tier, preference);

  return (
    <>
      {/* Overlay */}
      <div className={`settings-overlay ${open ? "open" : ""}`} onClick={onClose} />

      {/* Sheet */}
      <div className={`settings-sheet ${open ? "open" : ""}`}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-6"
          style={{ borderBottom: "1px solid var(--border-color)" }}
        >
          <div className="flex items-center gap-3">
            <Gear size={20} weight="fill" style={{ color: "var(--accent)" }} />
            <div>
              <p className="text-[10px] font-mono tracking-[0.15em] uppercase" style={{ color: "var(--text-tertiary)" }}>
                SETTINGS
              </p>
              <p className="text-base font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>
                创作设置
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ color: "var(--text-tertiary)" }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Hardware Tier */}
          <div>
            <p className="text-[10px] font-mono tracking-[0.15em] uppercase mb-2" style={{ color: "var(--text-tertiary)" }}>
              硬件档位
            </p>
            <select
              className="settings-select"
              value={tier}
              onChange={(e) => onTierChange(e.target.value as HardwareTier)}
            >
              {(Object.entries(TIER_LABELS) as [HardwareTier, string][]).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <p className="text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>
              根据你的电脑显卡配置选择，CPU 档位使用 ONNX 推理
            </p>
          </div>

          {/* Preference */}
          <div>
            <p className="text-[10px] font-mono tracking-[0.15em] uppercase mb-2" style={{ color: "var(--text-tertiary)" }}>
              偏好
            </p>
            <div className="pref-toggle">
              <button
                className={preference === "speed" ? "active" : ""}
                onClick={() => onPreferenceChange("speed")}
              >
                速度优先
              </button>
              <button
                className={preference === "quality" ? "active" : ""}
                onClick={() => onPreferenceChange("quality")}
              >
                质量优先
              </button>
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <p className="text-[10px] font-mono tracking-[0.15em] uppercase mb-2" style={{ color: "var(--text-tertiary)" }}>
              推荐模型组合
            </p>
            <div className="card-outer relative" style={{ borderRadius: "var(--radius-outer)" }}>
              <div className="card-inner space-y-1" style={{ padding: "20px" }}>
                {/* Vocal Sep */}
                <div className="model-setting-row">
                  <div>
                    <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>人声分离</p>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                      {getModelTimeEstimate(vocalSepModels, vocalSepModel)} · {getModelVram(vocalSepModels, vocalSepModel).toFixed(1)} GB
                    </p>
                  </div>
                  <select
                    className="settings-select"
                    style={{ width: "auto", minWidth: "180px", padding: "8px 36px 8px 12px", fontSize: "0.75rem" }}
                    value={vocalSepModel}
                    onChange={(e) => onVocalSepModelChange(e.target.value)}
                  >
                    {vocalSepModels.map((m) => (
                      <option key={m.key} value={m.key}>{m.display_name}</option>
                    ))}
                  </select>
                </div>

                {/* Style Extract */}
                <div className="model-setting-row">
                  <div>
                    <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>风格提取</p>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                      {getModelTimeEstimate(styleExtractModels, styleExtractModel)} · {getModelVram(styleExtractModels, styleExtractModel).toFixed(1)} GB
                    </p>
                  </div>
                  <select
                    className="settings-select"
                    style={{ width: "auto", minWidth: "180px", padding: "8px 36px 8px 12px", fontSize: "0.75rem" }}
                    value={styleExtractModel}
                    onChange={(e) => onStyleExtractModelChange(e.target.value)}
                  >
                    {styleExtractModels.map((m) => (
                      <option key={m.key} value={m.key}>{m.display_name}</option>
                    ))}
                  </select>
                </div>

                {/* Music Gen */}
                <div className="model-setting-row">
                  <div>
                    <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>音乐生成</p>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                      {getModelTimeEstimate(musicGenModels, musicGenModel)} · {getModelVram(musicGenModels, musicGenModel).toFixed(1)} GB
                    </p>
                  </div>
                  <select
                    className="settings-select"
                    style={{ width: "auto", minWidth: "180px", padding: "8px 36px 8px 12px", fontSize: "0.75rem" }}
                    value={musicGenModel}
                    onChange={(e) => onMusicGenModelChange(e.target.value)}
                  >
                    {musicGenModels.map((m) => (
                      <option key={m.key} value={m.key}>{m.display_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* VRAM + Time Summary */}
            <div className="flex items-center gap-4 mt-3 px-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono tracking-[0.1em]" style={{ color: "var(--text-tertiary)" }}>
                  预计耗时
                </span>
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  ~{Math.floor(estTime / 60)} 分 {estTime % 60} 秒
                </span>
              </div>
              <div className="w-px h-3" style={{ background: "var(--border-color)" }} />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono tracking-[0.1em]" style={{ color: "var(--text-tertiary)" }}>
                  预计显存
                </span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: vramWarning ? "#e8a840" : "var(--text-primary)" }}
                >
                  {totalVram.toFixed(1)} GB {vramWarning ? "⚠" : "✓"}
                </span>
              </div>
            </div>
            {vramWarning && (
              <p className="text-xs mt-1 px-1" style={{ color: "#e8a840" }}>
                所选模型显存超出档位预算 ({maxVram}GB)，可能导致 OOM
              </p>
            )}
          </div>

          {/* Remote Server (Beta) */}
          <div>
            <p className="text-[10px] font-mono tracking-[0.15em] uppercase mb-2" style={{ color: "var(--text-tertiary)" }}>
              远端服务器 (Beta)
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="留空则仅使用本地推理"
                className="flex-1 px-4 py-2.5 rounded-xl text-sm"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-secondary)",
                  fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif",
                  outline: "none",
                }}
              />
              <button className="btn-ghost text-xs" style={{ whiteSpace: "nowrap" }}>
                连接测试
              </button>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="px-6 py-5" style={{ borderTop: "1px solid var(--border-color)" }}>
          <button
            className="btn-primary w-full"
            onClick={onClose}
          >
            保存设置
          </button>
        </div>
      </div>
    </>
  );
}
