"use client";

import { useState, useEffect } from "react";
import { X, Gear } from "@phosphor-icons/react";
import type { HardwareTier, PreferenceMode, ProcessingMode, ModelInfo } from "@/types";
import { HARDWARE_TIERS, getTierConfig, getEstimatedTime, PROCESSING_MODE_LABELS } from "@/lib/hardware-tiers";

interface BackendState {
  running: boolean;
  port: number;
  managed: boolean;
}

const API_BASE_SVC = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function ServiceStatus({ processingMode, onProcessingModeChange }: { processingMode: ProcessingMode; onProcessingModeChange: (mode: ProcessingMode) => void }) {
  const [backend, setBackend] = useState<BackendState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [svcStatus, setSvcStatus] = useState<{ redis: boolean; celery: boolean; celeryMsg: string }>({ redis: false, celery: false, celeryMsg: "" });

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      // Check Next.js managed backend
      try {
        const res = await fetch("/api/services");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) { setBackend(data.backend ?? null); setError(null); }
        }
      } catch { /* Next.js route may be unavailable */ }

      // Check backend service status (Redis/Celery)
      try {
        const svcRes = await fetch(`${API_BASE_SVC}/config/services`);
        if (svcRes.ok) {
          const svc = await svcRes.json();
          if (!cancelled) {
            setSvcStatus({
              redis: svc.redis?.running ?? false,
              celery: svc.celery?.running ?? false,
              celeryMsg: svc.celery?.message || "",
            });
          }
        }
      } catch { /* backend may not be running */ }
    };
    poll();
    const i = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(i); };
  }, []);

  const call = async (action: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await res.json();
      if (!result.ok) {
        setError(result.message || `${action} 失败`);
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
      const pollRes = await fetch("/api/services");
      const pollData = await pollRes.json();
      setBackend(pollData.backend ?? null);
    } catch {
      setError(`${action} 请求失败`);
    } finally { setBusy(false); }
  };

  const running = backend?.running ?? false;
  const asyncAvailable = svcStatus.redis && svcStatus.celery;

  return (
    <div>
      <p className="text-[10px] font-mono tracking-[0.15em] uppercase mb-2" style={{ color: "var(--text-tertiary)" }}>
        服务状态
      </p>
      <div className="card-outer" style={{ borderRadius: "var(--radius-outer)" }}>
        <div className="card-inner space-y-0" style={{ padding: "8px 14px" }}>
          {/* Backend */}
          <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border-color)" }}>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full"
                style={{ background: running ? "#22c55e" : "#666", boxShadow: running ? "0 0 6px rgba(34,197,94,0.5)" : "none" }}
              />
              <span className="text-xs" style={{ color: running ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                Backend{backend ? ` :${backend.port}` : ""}
              </span>
            </div>
            <span className="text-[9px]" style={{ color: running ? "#22c55e" : "#666" }}>{running ? "运行中" : "未启动"}</span>
          </div>
          {/* Redis */}
          <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border-color)" }}>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full"
                style={{ background: svcStatus.redis ? "#22c55e" : "#666", boxShadow: svcStatus.redis ? "0 0 6px rgba(34,197,94,0.5)" : "none" }}
              />
              <span className="text-xs" style={{ color: svcStatus.redis ? "var(--text-primary)" : "var(--text-tertiary)" }}>Redis</span>
            </div>
            <span className="text-[9px]" style={{ color: svcStatus.redis ? "#22c55e" : "#666" }}>{svcStatus.redis ? "运行中" : "未启动"}</span>
          </div>
          {/* Celery */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full"
                style={{ background: svcStatus.celery ? "#22c55e" : "#666", boxShadow: svcStatus.celery ? "0 0 6px rgba(34,197,94,0.5)" : "none" }}
              />
              <span className="text-xs" style={{ color: svcStatus.celery ? "var(--text-primary)" : "var(--text-tertiary)" }}>Celery</span>
            </div>
            <span className="text-[9px]" style={{ color: svcStatus.celery ? "#22c55e" : "#666" }}>{svcStatus.celery ? svcStatus.celeryMsg : "未启动"}</span>
          </div>
        </div>
      </div>

      {/* Async mode warning */}
      {!asyncAvailable && (
        <div className="mt-2 p-2 rounded-lg" style={{ background: "rgba(232,168,64,0.1)", border: "1px solid rgba(232,168,64,0.2)" }}>
          <p className="text-[10px]" style={{ color: "#e8a840" }}>
            后台模式不可用 — 需要 Redis + Celery Worker 运行中
          </p>
          <p className="text-[9px] mt-0.5 opacity-70" style={{ color: "#e8a840" }}>
            请启动 Redis 和 Celery Worker，或切换到同步/自动模式
          </p>
        </div>
      )}

      {error && (
        <p className="text-[10px] mt-1.5" style={{ color: "#e8a840" }}>{error}</p>
      )}

      <button
        className="text-[9px] font-mono px-3 py-1 rounded-full mt-2"
        style={{
          background: running ? "var(--bg-tertiary)" : "var(--accent)",
          color: running ? "var(--text-secondary)" : "#0d0d0d",
          opacity: busy ? 0.5 : 1,
          cursor: busy ? "not-allowed" : "pointer",
          border: "none",
        }}
        disabled={busy}
        onClick={() => call(running ? "stop" : "start")}
      >
        {busy ? "..." : running ? "Stop Backend" : "Start Backend"}
      </button>
    </div>
  );
}

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
  processingMode: ProcessingMode;
  onProcessingModeChange: (mode: ProcessingMode) => void;
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
  processingMode,
  onProcessingModeChange,
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

          {/* Processing Mode */}
          <div>
            <p className="text-[10px] font-mono tracking-[0.15em] uppercase mb-2" style={{ color: "var(--text-tertiary)" }}>
              处理模式
            </p>
            <div className="pref-toggle">
              {(Object.entries(PROCESSING_MODE_LABELS) as [ProcessingMode, { label: string; sub: string }][]).map(([key, { label, sub }]) => (
                <button
                  key={key}
                  className={processingMode === key ? "active" : ""}
                  onClick={() => onProcessingModeChange(key)}
                >
                  {label}
                  <span className="block text-[9px] opacity-60 mt-0.5">{sub}</span>
                </button>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>
              {processingMode === "sync"
                ? "只需要后端+前端两个服务，运行 python start_all.py 即可"
                : processingMode === "async"
                ? "需要 Redis + Celery Worker，运行 python start_all.py --async"
                : "自动选择：运行 python start_all.py --async 体验完整功能"}
            </p>
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

          {/* Service Status */}
          <ServiceStatus processingMode={processingMode} onProcessingModeChange={onProcessingModeChange} />
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
