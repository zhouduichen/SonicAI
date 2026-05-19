# Hardware-Adaptive AI Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 SonicAI 支持从 RTX 5080 (16G) 到无独显 CPU 的 5 个硬件档位，用户选择档位后自动推荐模型组合，CPU 档位通过 ONNX 推理。

**Architecture:** 新增 ModelRecommender 做档位到模型的映射 + ResourceManager 替代原 GPUMemoryManager 管理多路径执行 + 三个 LocalProvider 各自增加 ONNX 推理分支。前端在 Sidebar 底部增加 SETTINGS 入口，以滑出面板形式展示设置。Docker 化部署。

**Tech Stack:** FastAPI + Celery + ONNX Runtime + Next.js 14 + Tailwind CSS + Framer Motion

---

### Task 1: Hardware Tiers Data (Frontend)

**Files:**
- Create: `frontend/src/lib/hardware-tiers.ts`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add HardwareTierConfig type to types**

```typescript
// frontend/src/types/index.ts — append after existing types:

export type HardwareTier = "ultra" | "high" | "mid" | "low" | "cpu";

export type PreferenceMode = "speed" | "quality";

export interface TierPreset {
  vocalSepModel: string;
  styleExtractModel: string;
  musicGenModel: string;
}

export interface HardwareTierConfig {
  tier: HardwareTier;
  label: string;
  maxVramGB: number;
  presets: Record<PreferenceMode, TierPreset>;
}
```

- [ ] **Step 2: Create hardware-tiers.ts with all 5 tiers and presets**

```typescript
// frontend/src/lib/hardware-tiers.ts
import type { HardwareTierConfig, PreferenceMode, TierPreset } from "@/types";

const PRESET_TIME: Record<PreferenceMode, number> = {
  ultra: { speed: 60, quality: 120 },
  high: { speed: 80, quality: 150 },
  mid: { speed: 90, quality: 180 },
  low: { speed: 120, quality: 160 },
  cpu: { speed: 180, quality: 300 },
} as const;

export const HARDWARE_TIERS: HardwareTierConfig[] = [
  {
    tier: "ultra",
    label: "旗舰 (16G+)",
    maxVramGB: 16,
    presets: {
      speed: { vocalSepModel: "demucs_mdx_extra", styleExtractModel: "clap_laion", musicGenModel: "musicgen_medium" },
      quality: { vocalSepModel: "demucs_htdemucs", styleExtractModel: "clap_msclap", musicGenModel: "musicgen_large" },
    },
  },
  {
    tier: "high",
    label: "高端 (12G+)",
    maxVramGB: 12,
    presets: {
      speed: { vocalSepModel: "demucs_mdx_extra", styleExtractModel: "clap_laion", musicGenModel: "musicgen_medium" },
      quality: { vocalSepModel: "demucs_htdemucs", styleExtractModel: "clap_msclap", musicGenModel: "musicgen_melody" },
    },
  },
  {
    tier: "mid",
    label: "中端 (8G+)",
    maxVramGB: 8,
    presets: {
      speed: { vocalSepModel: "spleeter_2stems", styleExtractModel: "clap_laion", musicGenModel: "musicgen_small" },
      quality: { vocalSepModel: "spleeter_5stems", styleExtractModel: "clap_laion", musicGenModel: "musicgen_medium" },
    },
  },
  {
    tier: "low",
    label: "入门 (6G+)",
    maxVramGB: 6,
    presets: {
      speed: { vocalSepModel: "spleeter_2stems", styleExtractModel: "encodec_6kbps", musicGenModel: "musicgen_small" },
      quality: { vocalSepModel: "spleeter_5stems", styleExtractModel: "encodec_6kbps", musicGenModel: "musicgen_small" },
    },
  },
  {
    tier: "cpu",
    label: "CPU (无独显)",
    maxVramGB: 0,
    presets: {
      speed: { vocalSepModel: "spleeter_2stems", styleExtractModel: "encodec_6kbps", musicGenModel: "musicgen_small" },
      quality: { vocalSepModel: "spleeter_5stems", styleExtractModel: "clap_laion", musicGenModel: "musicgen_small" },
    },
  },
];

export function getTierConfig(tier: string): HardwareTierConfig | undefined {
  return HARDWARE_TIERS.find((t) => t.tier === tier);
}

export function getEstimatedTime(tier: string, mode: PreferenceMode): number {
  return (PRESET_TIME as Record<string, Record<string, number>>)[tier]?.[mode] ?? 120;
}
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd frontend && npx tsc --noEmit`
Expected: No new errors from these two files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/hardware-tiers.ts
git commit -m "feat: add hardware tier config data and types"
```

---

### Task 2: SettingsPanel Component (Frontend)

**Files:**
- Create: `frontend/src/components/SettingsPanel.tsx`
- Modify: `frontend/src/app/globals.css` — append styles for settings sheet

- [ ] **Step 1: Add CSS for settings sheet**

```css
/* frontend/src/app/globals.css — append at end of file */

/* ── Settings Sheet ── */
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 0.35s cubic-bezier(0.32, 0.72, 0, 1);
  pointer-events: none;
}

.settings-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.light .settings-overlay {
  background: rgba(0, 0, 0, 0.15);
}

.settings-sheet {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 420px;
  max-width: 90vw;
  z-index: 101;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  transform: translateX(100%);
  transition: transform 0.4s cubic-bezier(0.32, 0.72, 0, 1);
  overflow-y: auto;
  padding: 0;
}

.settings-sheet.open {
  transform: translateX(0);
}

/* Settings select — matching input fields but compact */
.settings-select {
  appearance: none;
  width: 100%;
  padding: 10px 16px;
  padding-right: 40px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.8125rem;
  font-family: 'Plus Jakarta Sans', 'DM Sans', sans-serif;
  cursor: pointer;
  transition: border-color 0.3s cubic-bezier(0.32, 0.72, 0, 1);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 256 256'%3E%3Cpath fill='%23a0a0a0' d='M213.66 93.66L128 179.31L42.34 93.66a8 8 0 0 1 11.32-11.32L128 156.69l74.34-74.35a8 8 0 0 1 11.32 11.32Z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
}

.settings-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.settings-select option {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

/* Preference toggle */
.pref-toggle {
  display: flex;
  border-radius: 9999px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.pref-toggle button {
  flex: 1;
  padding: 10px 20px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-family: 'Plus Jakarta Sans', 'DM Sans', sans-serif;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

.pref-toggle button.active {
  background: var(--accent);
  color: #0d0d0d;
}

.light .pref-toggle button.active {
  color: #fafaf9;
}

/* Model row in settings */
.model-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-color);
}

.model-setting-row:last-child {
  border-bottom: none;
}
```

- [ ] **Step 2: Create SettingsPanel component**

```tsx
// frontend/src/components/SettingsPanel.tsx
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Gear, Globe } from "@phosphor-icons/react";
import type { HardwareTier, PreferenceMode, TierPreset, ModelInfo, ModelCatalog } from "@/types";
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
  const maxVram = config?.maxVramGB ?? 16;
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
            style={{ color: "var(--text-tertiary)", transition: "all 0.2s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.background = "transparent"; }}
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
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd frontend && npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SettingsPanel.tsx frontend/src/app/globals.css
git commit -m "feat: add SettingsPanel slide-out sheet component"
```

---

### Task 3: Integrate SettingsPanel into Sidebar and Create Page

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/app/create/page.tsx`

- [ ] **Step 1: Add onSettingsClick prop to Sidebar and SETTINGS nav item**

In `frontend/src/components/Sidebar.tsx`, add the prop and nav item:

```tsx
// Change interface to add onSettingsClick
interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSettingsClick: () => void;  // NEW
}

export default function Sidebar({ activeTab, onTabChange, onSettingsClick }: SidebarProps) {
```

Find the line `{/* Bottom */}` section (after the nav items closing `</nav>` and before `<div className="p-4" style={{ borderTop:`). Replace with:

```tsx
        {/* Settings nav item — after Archive, before divider */}
        <div className="px-4 mt-2">
          <button onClick={onSettingsClick} className="nav-item">
            <Gear size={18} weight="regular" style={{ color: "var(--text-tertiary)" }} />
            <div className="text-left flex-1">
              <p className="text-[10px] font-mono tracking-[0.1em]" style={{ color: "var(--text-tertiary)" }}>SETTINGS</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>硬件设置</p>
            </div>
          </button>
        </div>
```

Add the `Gear` import at the top, after the existing Phosphor imports:

```tsx
import { House, MusicNotes, WaveSine, Books, Playlist, Disc, Gear } from "@phosphor-icons/react";
```

- [ ] **Step 2: Add tier/preference state and SettingsPanel rendering to create page**

In `frontend/src/app/create/page.tsx`, import the new dependencies:

```tsx
import SettingsPanel from "@/components/SettingsPanel";
import { getTierConfig } from "@/lib/hardware-tiers";
import type { HardwareTier, PreferenceMode } from "@/types";
```

Add state variables inside the `CreatePage` component, after existing useState declarations:

```tsx
  const [showSettings, setShowSettings] = useState(false);

  // Read saved tier/pref from localStorage, default to mid/speed
  const [hardwareTier, setHardwareTier] = useState<HardwareTier>(() => {
    if (typeof window === "undefined") return "mid";
    return (localStorage.getItem("sonicai_tier") as HardwareTier) || "mid";
  });
  const [preference, setPreference] = useState<PreferenceMode>(() => {
    if (typeof window === "undefined") return "speed";
    return (localStorage.getItem("sonicai_preference") as PreferenceMode) || "speed";
  });

  // Model selections driven by tier + preference
  const [vocalSepModel, setVocalSepModel] = useState(() => {
    if (typeof window === "undefined") return "demucs_htdemucs";
    const saved = localStorage.getItem("sonicai_vocal_sep");
    if (saved) return saved;
    return getTierConfig(hardwareTier)?.presets[preference].vocalSepModel ?? "demucs_htdemucs";
  });
  const [styleExtractModel, setStyleExtractModel] = useState(() => {
    if (typeof window === "undefined") return "clap_laion";
    const saved = localStorage.getItem("sonicai_style_extract");
    if (saved) return saved;
    return getTierConfig(hardwareTier)?.presets[preference].styleExtractModel ?? "clap_laion";
  });
  const [musicGenModel, setMusicGenModel] = useState(() => {
    if (typeof window === "undefined") return "musicgen_small";
    const saved = localStorage.getItem("sonicai_music_gen");
    if (saved) return saved;
    return getTierConfig(hardwareTier)?.presets[preference].musicGenModel ?? "musicgen_small";
  });

  // Persist tier changes
  const handleTierChange = (tier: HardwareTier) => {
    setHardwareTier(tier);
    localStorage.setItem("sonicai_tier", tier);
    const preset = getTierConfig(tier)?.presets[preference];
    if (preset) {
      setVocalSepModel(preset.vocalSepModel);
      setStyleExtractModel(preset.styleExtractModel);
      setMusicGenModel(preset.musicGenModel);
      localStorage.setItem("sonicai_vocal_sep", preset.vocalSepModel);
      localStorage.setItem("sonicai_style_extract", preset.styleExtractModel);
      localStorage.setItem("sonicai_music_gen", preset.musicGenModel);
    }
  };

  const handlePreferenceChange = (mode: PreferenceMode) => {
    setPreference(mode);
    localStorage.setItem("sonicai_preference", mode);
    const preset = getTierConfig(hardwareTier)?.presets[mode];
    if (preset) {
      setVocalSepModel(preset.vocalSepModel);
      setStyleExtractModel(preset.styleExtractModel);
      setMusicGenModel(preset.musicGenModel);
      localStorage.setItem("sonicai_vocal_sep", preset.vocalSepModel);
      localStorage.setItem("sonicai_style_extract", preset.styleExtractModel);
      localStorage.setItem("sonicai_music_gen", preset.musicGenModel);
    }
  };

  const handleVocalSepModelChange = (key: string) => {
    setVocalSepModel(key);
    localStorage.setItem("sonicai_vocal_sep", key);
  };
  const handleStyleExtractModelChange = (key: string) => {
    setStyleExtractModel(key);
    localStorage.setItem("sonicai_style_extract", key);
  };
  const handleMusicGenModelChange = (key: string) => {
    setMusicGenModel(key);
    localStorage.setItem("sonicai_music_gen", key);
  };
```

Replace `<Sidebar activeTab={activeTab} onTabChange={setActiveTab} />` with:

```tsx
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSettingsClick={() => setShowSettings(true)} />
```

And replace the Dropzone and GenerationConsole model props with the state-driven values. Find the Dropzone call:

```tsx
// Replace these hardcoded props in the Dropzone usage:
vocalSepModel="demucs_htdemucs"
styleExtractModel="clap_laion"
onVocalSepModelChange={() => {}}
onStyleExtractModelChange={() => {}}

// With:
vocalSepModel={vocalSepModel}
styleExtractModel={styleExtractModel}
onVocalSepModelChange={handleVocalSepModelChange}
onStyleExtractModelChange={handleStyleExtractModelChange}
```

And the GenerationConsole:

```tsx
// Replace:
musicGenModel="musicgen_small"
onMusicGenModelChange={() => {}}

// With:
musicGenModel={musicGenModel}
onMusicGenModelChange={handleMusicGenModelChange}
```

Add SettingsPanel rendering at the end of the JSX, before the closing `</div>` (the outermost div):

```tsx
      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        tier={hardwareTier}
        onTierChange={handleTierChange}
        preference={preference}
        onPreferenceChange={handlePreferenceChange}
        vocalSepModels={DEFAULT_VOCAL_SEPARATION_MODELS}
        styleExtractModels={DEFAULT_STYLE_EXTRACTION_MODELS}
        musicGenModels={DEFAULT_MUSIC_GENERATION_MODELS}
        vocalSepModel={vocalSepModel}
        styleExtractModel={styleExtractModel}
        musicGenModel={musicGenModel}
        onVocalSepModelChange={handleVocalSepModelChange}
        onStyleExtractModelChange={handleStyleExtractModelChange}
        onMusicGenModelChange={handleMusicGenModelChange}
      />
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/app/create/page.tsx
git commit -m "feat: integrate SettingsPanel into Sidebar and create page"
```

---

### Task 4: Backend ModelRecommender Service

**Files:**
- Create: `backend/app/services/model_recommender.py`

- [ ] **Step 1: Create model_recommender.py**

```python
"""Hardware tier → model preset mapping with VRAM validation."""

from dataclasses import dataclass
from typing import Literal

HardwareTier = Literal["ultra", "high", "mid", "low", "cpu"]
PreferenceMode = Literal["speed", "quality"]


@dataclass(frozen=True)
class TierPreset:
    vocal_sep_model: str
    style_extract_model: str
    music_gen_model: str


@dataclass(frozen=True)
class TierConfig:
    tier: HardwareTier
    label_cn: str
    max_vram_gb: float
    speed_preset: TierPreset
    quality_preset: TierPreset
    speed_time_seconds: int
    quality_time_seconds: int


TIER_CONFIGS: dict[HardwareTier, TierConfig] = {
    "ultra": TierConfig(
        tier="ultra",
        label_cn="旗舰 (16G+)",
        max_vram_gb=16.0,
        speed_preset=TierPreset("demucs_mdx_extra", "clap_laion", "musicgen_medium"),
        quality_preset=TierPreset("demucs_htdemucs", "clap_msclap", "musicgen_large"),
        speed_time_seconds=60,
        quality_time_seconds=120,
    ),
    "high": TierConfig(
        tier="high",
        label_cn="高端 (12G+)",
        max_vram_gb=12.0,
        speed_preset=TierPreset("demucs_mdx_extra", "clap_laion", "musicgen_medium"),
        quality_preset=TierPreset("demucs_htdemucs", "clap_msclap", "musicgen_melody"),
        speed_time_seconds=80,
        quality_time_seconds=150,
    ),
    "mid": TierConfig(
        tier="mid",
        label_cn="中端 (8G+)",
        max_vram_gb=8.0,
        speed_preset=TierPreset("spleeter_2stems", "clap_laion", "musicgen_small"),
        quality_preset=TierPreset("spleeter_5stems", "clap_laion", "musicgen_medium"),
        speed_time_seconds=90,
        quality_time_seconds=180,
    ),
    "low": TierConfig(
        tier="low",
        label_cn="入门 (6G+)",
        max_vram_gb=6.0,
        speed_preset=TierPreset("spleeter_2stems", "encodec_6kbps", "musicgen_small"),
        quality_preset=TierPreset("spleeter_5stems", "encodec_6kbps", "musicgen_small"),
        speed_time_seconds=120,
        quality_time_seconds=160,
    ),
    "cpu": TierConfig(
        tier="cpu",
        label_cn="CPU (无独显)",
        max_vram_gb=0.0,
        speed_preset=TierPreset("spleeter_2stems", "encodec_6kbps", "musicgen_small"),
        quality_preset=TierPreset("spleeter_5stems", "clap_laion", "musicgen_small"),
        speed_time_seconds=180,
        quality_time_seconds=300,
    ),
}


def get_tier_config(tier: str) -> TierConfig:
    """Return tier config or fallback to 'ultra'."""
    return TIER_CONFIGS.get(tier, TIER_CONFIGS["ultra"])


def get_preset(tier: str, mode: PreferenceMode = "speed") -> TierPreset:
    config = get_tier_config(tier)
    return config.speed_preset if mode == "speed" else config.quality_preset


def validate_vram(model_vram_gb: float, tier_budget: float) -> bool:
    """Check if a single model fits within the tier's VRAM budget."""
    if tier_budget <= 0:
        return True  # CPU tier, no VRAM check
    return model_vram_gb <= tier_budget
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/model_recommender.py
git commit -m "feat: add ModelRecommender service with tier presets"
```

---

### Task 5: Add time_estimate and supports_gpu to ModelProvider Base

**Files:**
- Modify: `backend/app/models/providers/base.py`

- [ ] **Step 1: Add abstract methods to base.py**

Insert after the `is_loaded` abstract method:

```python
    @abstractmethod
    def time_estimate(self, duration_seconds: int = 30) -> float:
        """Estimated inference time in seconds for the given output duration."""

    @abstractmethod
    def supports_gpu(self) -> bool:
        """Return True if this provider has a GPU implementation. False for ONNX-only providers."""
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/providers/base.py
git commit -m "feat: add time_estimate and supports_gpu to ModelProvider base"
```

---

### Task 6: Rename GPUMemoryManager to ResourceManager

**Files:**
- Create: `backend/app/models/providers/resource_manager.py`
- Modify: `backend/app/tasks/audio_pipeline.py`
- Modify: `backend/app/core/config.py`

- [ ] **Step 1: Add hardware_tier setting to config**

In `backend/app/core/config.py`, add to the Settings class:

```python
    # Hardware tier
    SONICAI_HARDWARE_TIER: str = "ultra"
    SONICAI_PREFERENCE: str = "speed"
```

- [ ] **Step 2: Create resource_manager.py**

```python
"""Resource manager: GPU memory + execution path selection for local models."""

import logging
import os
from app.models.providers.base import ModelProvider
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ResourceManager:
    """Ensures one model loaded at a time. Selects GPU>ONNX>Mock execution path."""

    def __init__(self, vram_budget_gb: float = 16.0):
        self._current: ModelProvider | None = None
        self._vram_budget = vram_budget_gb

    @property
    def vram_budget(self) -> float:
        return self._vram_budget

    @vram_budget.setter
    def vram_budget(self, value: float) -> None:
        self._vram_budget = value

    @property
    def current_model(self) -> ModelProvider | None:
        return self._current

    def _gpu_available(self) -> bool:
        """Check if CUDA GPU is available."""
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            return False

    def _onnx_model_exists(self, provider: ModelProvider) -> bool:
        """Check if ONNX model file exists for this provider."""
        onnx_dir = os.path.expanduser("~/.sonicai/models")
        manifest = os.path.join(onnx_dir, "model_manifest.json")
        if not os.path.exists(manifest):
            return False
        import json
        with open(manifest, "r") as f:
            models = json.load(f)
        return provider.model_key in models

    def acquire(self, provider: ModelProvider) -> None:
        """Load a model via the best available path."""
        vram = provider.vram_required()
        use_gpu = provider.supports_gpu() and self._gpu_available() and vram <= self._vram_budget

        if not use_gpu and not provider.supports_gpu():
            logger.info(f"Provider {provider.model_key} is CPU/ONNX-only, bypassing GPU path")

        # Unload previous model if needed
        if self._current is not None:
            if self._current.model_key == provider.model_key and self._current.is_loaded():
                logger.info(f"Model {provider.model_key} already loaded, reusing")
                return
            logger.info(f"Unloading {self._current.model_key}")
            self._current.unload()
            self._current = None

        if not use_gpu:
            if provider.supports_gpu():
                logger.info(
                    f"GPU path unavailable for {provider.model_key}: "
                    f"vram={vram}GB budget={self._vram_budget}GB gpu={self._gpu_available()}. "
                    f"Falling back to CPU/ONNX."
                )

        logger.info(f"Loading {provider.model_key} (use_gpu={use_gpu}, vram={vram}GB)")
        provider.load()
        self._current = provider

    def release_all(self) -> None:
        """Unload current model, free all resources."""
        if self._current is not None:
            logger.info(f"Releasing {self._current.model_key}")
            self._current.unload()
            self._current = None


# Module-level singleton — budget set per request by the pipeline
resource_manager = ResourceManager(vram_budget_gb=16.0)
```

- [ ] **Step 3: Update audio_pipeline.py imports**

In `backend/app/tasks/audio_pipeline.py`, change:

```python
# Replace:
from app.models.providers.gpu_manager import gpu_manager

# With:
from app.models.providers.resource_manager import resource_manager
```

And replace all `gpu_manager.acquire(provider)` with `resource_manager.acquire(provider)` and `gpu_manager.release_all()` with `resource_manager.release_all()`.

- [ ] **Step 4: Delete old gpu_manager.py**

Run: `rm backend/app/models/providers/gpu_manager.py`

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/providers/resource_manager.py backend/app/core/config.py backend/app/tasks/audio_pipeline.py
git rm backend/app/models/providers/gpu_manager.py
git commit -m "feat: replace GPUMemoryManager with ResourceManager supporting path selection"
```

---

### Task 7: Update LocalDemucsProvider with ONNX Support

**Files:**
- Modify: `backend/app/models/providers/local_demucs.py`

- [ ] **Step 1: Add time_estimate, supports_gpu, and ONNX path**

Insert `time_estimate` and `supports_gpu` methods after `vram_required`:

```python
    def time_estimate(self, duration_seconds: int = 30) -> float:
        base = {"demucs_htdemucs": 60, "demucs_mdx_extra": 40, "demucs_6s": 50, "spleeter_2stems": 15, "spleeter_5stems": 25}
        t = base.get(self._key, 40)
        if not self.supports_gpu() and not DEMUCS_AVAILABLE:
            t *= 3  # CPU penalty
        return t * (duration_seconds / 30)

    def supports_gpu(self) -> bool:
        return self._key.startswith("demucs") and DEMUCS_AVAILABLE
```

Modify the `load` method to support ONNX path:

```python
    def load(self) -> None:
        if not DEMUCS_AVAILABLE and not self._has_onnx():
            self._loaded = True  # Mock
            return
        self._loaded = True
        logger.info(f"Demucs provider ({self._key}) ready")

    def _has_onnx(self) -> bool:
        import json
        manifest = os.path.join(os.path.expanduser("~/.sonicai/models"), "model_manifest.json")
        if not os.path.exists(manifest):
            return False
        with open(manifest, "r") as f:
            return self._key in json.load(f)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/providers/local_demucs.py
git commit -m "feat: add time_estimate, supports_gpu to Demucs provider"
```

---

### Task 8: Update LocalCLAPProvider with ONNX Support

**Files:**
- Modify: `backend/app/models/providers/local_clap.py`

- [ ] **Step 1: Add time_estimate and supports_gpu**

Insert after `vram_required`:

```python
    def time_estimate(self, duration_seconds: int = 30) -> float:
        base = {"clap_laion": 15, "clap_msclap": 20, "clap_htsat": 40, "encodec_6kbps": 8}
        t = base.get(self._key, 20)
        if not self.supports_gpu() and not CLAP_AVAILABLE:
            t *= 3
        return t * (duration_seconds / 30)

    def supports_gpu(self) -> bool:
        return CLAP_AVAILABLE
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/providers/local_clap.py
git commit -m "feat: add time_estimate and supports_gpu to CLAP provider"
```

---

### Task 9: Update LocalMusicGenProvider with ONNX and time_estimate

**Files:**
- Modify: `backend/app/models/providers/local_musicgen.py`

- [ ] **Step 1: Add time_estimate and supports_gpu**

Insert after `vram_required`:

```python
    def time_estimate(self, duration_seconds: int = 30) -> float:
        base = {"musicgen_small": 45, "musicgen_medium": 90, "musicgen_large": 180, "musicgen_melody": 100, "audioldm2": 120}
        t = base.get(self._key, 90)
        if not self.supports_gpu():
            t *= 3
        return t * (duration_seconds / 30)

    def supports_gpu(self) -> bool:
        return MUSICGEN_AVAILABLE
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/providers/local_musicgen.py
git commit -m "feat: add time_estimate and supports_gpu to MusicGen provider"
```

---

### Task 10: ONNX Helper Utility

**Files:**
- Create: `backend/app/utils/onnx_helper.py`

- [ ] **Step 1: Create ONNX helper**

```python
"""ONNX model discovery and caching utilities."""

import os
import json
import logging

logger = logging.getLogger(__name__)

DEFAULT_ONNX_DIR = os.path.expanduser("~/.sonicai/models")


def get_onnx_model_path(model_key: str) -> str | None:
    """Return the ONNX file path for a model key, or None if not installed."""
    manifest_dir = os.environ.get("SONICAI_ONNX_DIR", DEFAULT_ONNX_DIR)
    manifest_path = os.path.join(manifest_dir, "model_manifest.json")

    if not os.path.exists(manifest_path):
        return None

    with open(manifest_path, "r") as f:
        manifest = json.load(f)

    entry = manifest.get(model_key)
    if not entry:
        return None

    model_path = os.path.join(manifest_dir, entry.get("filename", ""))
    if os.path.exists(model_path):
        return model_path
    return None


def is_onnx_installed(model_key: str) -> bool:
    return get_onnx_model_path(model_key) is not None


def any_onnx_installed() -> bool:
    """Check if any ONNX models are installed."""
    manifest_path = os.path.join(DEFAULT_ONNX_DIR, "model_manifest.json")
    if not os.path.exists(manifest_path):
        return False
    with open(manifest_path, "r") as f:
        manifest = json.load(f)
    for entry in manifest.values():
        if os.path.exists(os.path.join(DEFAULT_ONNX_DIR, entry.get("filename", ""))):
            return True
    return False
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/utils/onnx_helper.py
git commit -m "feat: add ONNX helper for model discovery"
```

---

### Task 11: Setup CPU Models Script

**Files:**
- Create: `scripts/setup_cpu_models.py`
- Create: `scripts/` directory if needed

- [ ] **Step 1: Create the setup script**

```python
#!/usr/bin/env python3
"""Download ONNX models for CPU inference into ~/.sonicai/models/."""

import os
import json
import sys
import hashlib
from urllib.request import urlretrieve

ONNX_DIR = os.path.expanduser("~/.sonicai/models")
MANIFEST_PATH = os.path.join(ONNX_DIR, "model_manifest.json")

# Model registry — ONNX files hosted on HuggingFace or similar
# URLs are placeholders until actual converted models are published
MODELS = {
    "spleeter_2stems": {
        "filename": "spleeter_2stems_int8.onnx",
        "url": "https://huggingface.co/sonicai/spleeter-onnx/resolve/main/spleeter_2stems_int8.onnx",
        "sha256": "",
        "size_mb": 50,
    },
    "spleeter_5stems": {
        "filename": "spleeter_5stems_int8.onnx",
        "url": "https://huggingface.co/sonicai/spleeter-onnx/resolve/main/spleeter_5stems_int8.onnx",
        "sha256": "",
        "size_mb": 60,
    },
    "clap_laion": {
        "filename": "clap_laion_int8.onnx",
        "url": "https://huggingface.co/sonicai/clap-onnx/resolve/main/clap_laion_int8.onnx",
        "sha256": "",
        "size_mb": 80,
    },
    "encodec_6kbps": {
        "filename": "encodec_6kbps_int8.onnx",
        "url": "https://huggingface.co/sonicai/encodec-onnx/resolve/main/encodec_6kbps_int8.onnx",
        "sha256": "",
        "size_mb": 30,
    },
    "musicgen_small": {
        "filename": "musicgen_small_int8.onnx",
        "url": "https://huggingface.co/sonicai/musicgen-onnx/resolve/main/musicgen_small_int8.onnx",
        "sha256": "",
        "size_mb": 300,
    },
}


def download_with_progress(url: str, dest: str, desc: str):
    """Download a file with a simple progress indicator."""
    print(f"  Downloading {desc}...")

    def _report(count, block_size, total_size):
        if total_size > 0:
            pct = min(count * block_size * 100 // total_size, 100)
            mb = count * block_size // (1024 * 1024)
            total_mb = total_size // (1024 * 1024)
            print(f"\r    {mb}/{total_mb} MB ({pct}%)", end="", flush=True)

    urlretrieve(url, dest, reporthook=_report)
    print()


def main():
    os.makedirs(ONNX_DIR, exist_ok=True)

    # Load existing manifest
    existing = {}
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, "r") as f:
            existing = json.load(f)

    print(f"SonicAI ONNX Model Setup")
    print(f"Models directory: {ONNX_DIR}")
    print(f"Models to install: {len(MODELS)}")
    print()

    total_size = sum(m["size_mb"] for m in MODELS.values())
    print(f"Total download size: ~{total_size} MB")
    print()

    manifest = {}
    success = 0

    for model_key, info in MODELS.items():
        dest_path = os.path.join(ONNX_DIR, info["filename"])

        # Skip if already downloaded
        if os.path.exists(dest_path) and model_key in existing:
            print(f"  [{model_key}] Already installed, skipping")
            manifest[model_key] = info
            success += 1
            continue

        try:
            download_with_progress(info["url"], dest_path, info["filename"])
            manifest[model_key] = info
            success += 1
            print(f"  [{model_key}] Done")
        except Exception as e:
            print(f"  [{model_key}] Failed: {e}")

    # Write manifest
    manifest_data = {
        k: {"filename": v["filename"]}
        for k, v in manifest.items()
    }
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest_data, f, indent=2)

    print()
    print(f"Installed: {success}/{len(MODELS)} models")
    print(f"Manifest: {MANIFEST_PATH}")

    if success == 0:
        print()
        print("No models installed. If all downloads failed, check your network connection.")
        print("You can still use the app in mock mode for UI preview.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Commit**

```bash
git add scripts/setup_cpu_models.py
git commit -m "feat: add ONNX model download script for CPU setup"
```

---

### Task 12: Update requirements.txt

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add onnxruntime to requirements**

Append to `backend/requirements.txt`:

```
onnxruntime==1.20.0
```

- [ ] **Step 2: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add onnxruntime dependency"
```

---

### Task 13: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/entrypoint.sh`
- Create: `.env.example`

- [ ] **Step 1: Create backend/Dockerfile**

```dockerfile
FROM nvidia/cuda:12.4-runtime-ubuntu22.04

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3-pip supervisor \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads /app/generated

RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
```

- [ ] **Step 2: Create backend/entrypoint.sh**

```bash
#!/bin/bash
set -e

echo "=== SonicAI Backend ==="

# Check GPU
if nvidia-smi &>/dev/null; then
    echo "GPU detected via nvidia-smi"
else
    echo "No GPU detected — running CPU-only mode"
fi

# Read tier from env
TIER="${SONICAI_HARDWARE_TIER:-ultra}"
echo "Hardware tier: $TIER"

# Setup ONNX models if CPU tier and models not installed
if [ "$TIER" = "cpu" ]; then
    if [ ! -f "$HOME/.sonicai/models/model_manifest.json" ]; then
        echo "CPU tier selected — installing ONNX models..."
        python3 /app/scripts/setup_cpu_models.py || echo "ONNX setup failed, will use mock fallback"
    else
        echo "ONNX models already installed"
    fi
fi

# Start supervisor (uvicorn + celery worker)
cat > /etc/supervisor/conf.d/sonicai.conf << EOF
[supervisord]
nodaemon=true

[program:uvicorn]
command=python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
directory=/app
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:celery]
command=python3 -m celery -A app.tasks.celery_app worker -l info -P solo
directory=/app
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
EOF

exec supervisord -c /etc/supervisor/conf.d/sonicai.conf
```

- [ ] **Step 3: Create .env.example**

```env
SONICAI_HARDWARE_TIER=mid
SONICAI_PREFERENCE=speed
SONICAI_USE_REMOTE=false
SONICAI_REMOTE_URL=
REDIS_URL=redis://redis:6379/0
DATABASE_URL=sqlite:///./aimusic.db
SECRET_KEY=change-me-in-production
```

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile backend/entrypoint.sh .env.example
git commit -m "feat: add backend Dockerfile and entrypoint script"
```

---

### Task 14: Frontend Dockerfile and Expanded docker-compose

**Files:**
- Create: `frontend/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Create frontend/Dockerfile**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Expand docker-compose.yml**

```yaml
version: "3.9"

services:
  redis:
    image: redis:7-alpine
    container_name: aimusic-redis
    ports:
      - "6379:6379"
    restart: unless-stopped
    volumes:
      - redis_data:/data

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: aimusic-backend
    ports:
      - "8000:8000"
    environment:
      - SONICAI_HARDWARE_TIER=${SONICAI_HARDWARE_TIER:-mid}
      - SONICAI_PREFERENCE=${SONICAI_PREFERENCE:-speed}
      - REDIS_URL=redis://redis:6379/0
      - DATABASE_URL=sqlite:///./aimusic.db
      - SECRET_KEY=${SECRET_KEY:-dev-secret-key}
    volumes:
      - ./backend/uploads:/app/uploads
      - ./backend/generated:/app/generated
      - sonicai_models:/root/.sonicai/models
    depends_on:
      - redis
    restart: unless-stopped
    # GPU support — Docker ignores this if nvidia runtime not available
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: aimusic-frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:8000/api/v1
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  redis_data:
  sonicai_models:
```

- [ ] **Step 3: Verify docker-compose syntax**

Run: `docker compose config`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/Dockerfile docker-compose.yml
git commit -m "feat: complete Docker multi-service setup"
```

---

### Task 15: Add Hardware Tier Config API Endpoint

**Files:**
- Create: `backend/app/api/v1/config.py`
- Modify: `backend/app/api/v1/__init__.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create config API route**

```python
"""Hardware tier configuration endpoint."""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Literal

from app.services.model_recommender import (
    get_tier_config, get_preset,
    HardwareTier, PreferenceMode,
)

router = APIRouter(prefix="/config", tags=["config"])


class TierInfo(BaseModel):
    tier: str
    label_cn: str
    max_vram_gb: float
    speed_preset: dict
    quality_preset: dict
    speed_time_seconds: int
    quality_time_seconds: int


class TierListResponse(BaseModel):
    tiers: list[TierInfo]


@router.get("/tiers")
def list_tiers() -> TierListResponse:
    """Return all hardware tier configurations."""
    tiers = []
    for t in ["ultra", "high", "mid", "low", "cpu"]:
        cfg = get_tier_config(t)
        tiers.append(TierInfo(
            tier=cfg.tier,
            label_cn=cfg.label_cn,
            max_vram_gb=cfg.max_vram_gb,
            speed_preset={
                "vocal_sep_model": cfg.speed_preset.vocal_sep_model,
                "style_extract_model": cfg.speed_preset.style_extract_model,
                "music_gen_model": cfg.speed_preset.music_gen_model,
            },
            quality_preset={
                "vocal_sep_model": cfg.quality_preset.vocal_sep_model,
                "style_extract_model": cfg.quality_preset.style_extract_model,
                "music_gen_model": cfg.quality_preset.music_gen_model,
            },
            speed_time_seconds=cfg.speed_time_seconds,
            quality_time_seconds=cfg.quality_time_seconds,
        ))
    return TierListResponse(tiers=tiers)
```

- [ ] **Step 2: Register the router in main.py**

In `backend/app/main.py`, add the import and router registration:

```python
from app.api.v1.config import router as config_router
```

And add: `app.include_router(config_router, prefix="/api/v1")`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/v1/config.py backend/app/main.py
git commit -m "feat: add hardware tier config API endpoint"
```

---

### Task 16: End-to-End Verification

**Files:** None (verification only)

- [ ] **Step 1: Verify all files exist and are in correct locations**

Run:
```bash
ls -la backend/app/services/model_recommender.py
ls -la backend/app/models/providers/resource_manager.py
ls -la backend/app/utils/onnx_helper.py
ls -la scripts/setup_cpu_models.py
ls -la backend/app/api/v1/config.py
ls -la backend/Dockerfile backend/entrypoint.sh
ls -la frontend/Dockerfile
ls -la frontend/src/components/SettingsPanel.tsx
ls -la frontend/src/lib/hardware-tiers.ts
ls -la .env.example
```

Expected: All files exist.

- [ ] **Step 2: Verify Python imports work**

Run: `cd backend && python -c "from app.services.model_recommender import get_tier_config; print(get_tier_config('mid'))"`
Expected: Prints TierConfig for mid tier.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Start backend and verify /config/tiers endpoint works**

Run: `cd backend && uvicorn app.main:app --port 8000 &`
Then: `curl http://localhost:8000/api/v1/config/tiers`
Expected: JSON array with 5 tier objects.

- [ ] **Step 5: Start frontend and verify SettingsPanel opens**

Run: `cd frontend && npm run dev`
Open http://localhost:3000/create, click SETTINGS in sidebar.
Expected: Settings panel slides in from right with tier selector, preference toggle, model dropdowns.

- [ ] **Step 6: Commit final verification**

```bash
git add -A
git diff --cached --stat
git commit -m "chore: final verification — all files in place"
```
