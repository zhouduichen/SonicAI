"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Disc, Microphone, Waveform, ArrowRight } from "@phosphor-icons/react";
import Dropzone from "./Dropzone";
import StyleLibrary from "./StyleLibrary";
import VoiceModelLibrary from "./VoiceModelLibrary";
import ErrorBoundary from "./ErrorBoundary";
import { API_BASE } from "@/lib/auth";
import type { AudioAsset, StyleTag, VoiceModel, ModelInfo } from "@/types";

type AssetsTab = "audio" | "styles" | "voice";

interface AssetsWorkspaceProps {
  // Audio
  uploadingAssets: AudioAsset[];
  onUpload: (file: File) => Promise<void>;
  onDeleteAsset?: (assetId: string) => void;
  vocalSepModel: string;
  onVocalSepModelChange: (m: string) => void;
  vocalSepModels: ModelInfo[];
  styleExtractModel: string;
  onStyleExtractModelChange: (m: string) => void;
  styleExtractModels: ModelInfo[];

  // Styles
  styles: StyleTag[];
  selectedStyle: StyleTag | null;
  onStyleSelect: (s: StyleTag | null) => void;
  onDeleteStyle: (id: string) => void;

  // Voice
  voiceModels: VoiceModel[];
  selectedVoiceId: string | null | undefined;
  onVoiceSelect: (id: string) => void;
  onDeleteVoice: (id: string) => void;
  trainVoiceName: string;
  setTrainVoiceName: (v: string) => void;
  trainQualityTarget: string;
  setTrainQualityTarget: (v: string) => void;
  trainAssetIds: number[];
  setTrainAssetIds: (v: number[] | ((prev: number[]) => number[])) => void;
  onTrainVoice: () => Promise<void>;
  isTraining: boolean;
  singRefAssetId: string;
  setSingRefAssetId: (v: string) => void;
  onSingVoice: () => Promise<void>;
  isSinging: boolean;
  singError: string | null;
  vocalGenerations: any[];
  processingMode: string;
}

const TAB_META: Record<AssetsTab, { label: string; icon: React.ElementType; desc: string }> = {
  audio: { label: "音频素材", icon: Upload, desc: "上传音频 → 自动分离人声 → 提取风格特征" },
  styles: { label: "风格标签", icon: Disc, desc: "从音频中提取的音乐风格向量，用于控制生成方向" },
  voice: { label: "声音模型", icon: Microphone, desc: "训练自定义声音模型，用于歌曲人声合成" },
};

export default function AssetsWorkspace({
  uploadingAssets, onUpload, onDeleteAsset,
  vocalSepModel, onVocalSepModelChange, vocalSepModels,
  styleExtractModel, onStyleExtractModelChange, styleExtractModels,
  styles, selectedStyle, onStyleSelect, onDeleteStyle,
  voiceModels, selectedVoiceId, onVoiceSelect, onDeleteVoice,
  trainVoiceName, setTrainVoiceName, trainQualityTarget, setTrainQualityTarget,
  trainAssetIds, setTrainAssetIds, onTrainVoice, isTraining,
  singRefAssetId, setSingRefAssetId, onSingVoice, isSinging, singError,
  vocalGenerations, processingMode,
}: AssetsWorkspaceProps) {
  const [tab, setTab] = useState<AssetsTab>("audio");

  return (
    <div className="space-y-5">
      <span className="eyebrow mb-2 inline-block">ASSETS</span>
      <h2 className="text-3xl italic font-medium mt-1 tracking-tight"
        style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
        素材库
      </h2>
      {/* Tab-specific description */}
      <div className="flex items-center gap-3 mt-3 mb-5">
        <div className="w-8 h-px" style={{ background: "var(--accent)", opacity: 0.4 }} />
        <div className="w-1 h-1 rotate-45" style={{ background: "var(--accent)", opacity: 0.3 }} />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {TAB_META[tab].desc}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--border-color)", background: "var(--bg-tertiary)", width: "fit-content" }}>
        {(Object.entries(TAB_META) as [AssetsTab, typeof TAB_META[AssetsTab]][]).map(([key, { label, icon: Icon }]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-medium transition-all duration-300"
            style={{
              background: tab === key ? "var(--accent)" : "transparent",
              color: tab === key ? "var(--bg-primary)" : "var(--text-secondary)",
            }}
          >
            <Icon size={14} weight={tab === key ? "fill" : "regular"} />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Audio upload tab */}
        {tab === "audio" && (
          <motion.div key="audio" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }} className="max-w-2xl">
            <ErrorBoundary>
              <Dropzone
                onUpload={onUpload}
                onDeleteAsset={onDeleteAsset}
                assets={uploadingAssets}
                vocalSepModel={vocalSepModel}
                styleExtractModel={styleExtractModel}
                onVocalSepModelChange={onVocalSepModelChange}
                onStyleExtractModelChange={onStyleExtractModelChange}
                vocalSepModels={vocalSepModels}
                styleExtractModels={styleExtractModels}
              />
            </ErrorBoundary>
          </motion.div>
        )}

        {/* Styles tab */}
        {tab === "styles" && (
          <motion.div key="styles" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }} className="max-w-2xl">
            <ErrorBoundary>
              <StyleLibrary
                styles={styles}
                selectedId={selectedStyle?.id}
                onSelect={onStyleSelect}
                onDelete={onDeleteStyle}
              />
            </ErrorBoundary>
          </motion.div>
        )}

        {/* Style hint — shows when switching from audio tab */}
        <AnimatePresence>
          {tab === "styles" && styles.length === 0 && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="px-4 py-3 rounded-xl flex items-center gap-3"
              style={{ background: "var(--accent-soft)", border: "1px solid rgba(212,168,83,0.2)" }}>
              <Waveform size={14} style={{ color: "var(--accent)" }} />
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                前往「音频素材」标签上传音频文件，系统将自动提取风格特征
              </p>
              <ArrowRight size={14} style={{ color: "var(--accent)" }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Voice tab */}
        {tab === "voice" && (
          <motion.div key="voice" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }} className="max-w-2xl space-y-5">
            {/* Training stage pipeline indicator */}
            {voiceModels.filter(m => m.status === "training" || m.status === "preprocessing").length > 0 && (
              <div className="card-outer">
                <div className="card-inner px-6 py-4">
                  <p className="text-[10px] font-mono tracking-[0.1em] mb-3" style={{ color: "var(--text-tertiary)" }}>
                    训练进度
                  </p>
                  <TrainingPipeline models={voiceModels.filter(m => m.status !== "ready" && m.status !== "failed")} />
                </div>
              </div>
            )}

            {/* Training card */}
            <div className="card-outer">
              <div className="card-inner p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="eyebrow">训练</span>
                  <h3 className="text-lg italic font-medium"
                    style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
                    训练新声音
                  </h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
                      源音频 ({trainAssetIds.length} 首已选)
                    </p>
                    {uploadingAssets.filter(a => a.status === "completed").length === 0 ? (
                      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        请先在「音频素材」中上传并处理音频
                      </p>
                    ) : (
                      <div className="space-y-1 max-h-40 overflow-y-auto"
                        style={{ background: "var(--bg-primary)", borderRadius: "12px", padding: "8px", border: "1px solid var(--border-color)" }}>
                        {uploadingAssets.filter(a => a.status === "completed").map((a) => {
                          const checked = trainAssetIds.includes(Number(a.id));
                          return (
                            <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors"
                              style={{ background: checked ? "var(--accent-soft)" : "transparent" }}>
                              <input type="checkbox" checked={checked}
                                onChange={() => {
                                  const id = Number(a.id);
                                  setTrainAssetIds(prev => checked ? prev.filter(x => x !== id) : [...prev, id]);
                                }}
                                style={{ accentColor: "var(--accent)" }} />
                              <span className="text-xs" style={{ color: "var(--text-primary)" }}>{a.fileName}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>模型名称</p>
                    <input type="text" placeholder="例如：我的歌声" value={trainVoiceName}
                      onChange={(e) => setTrainVoiceName(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl text-sm"
                      style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)",
                        color: "var(--text-primary)", outline: "none", fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>品质目标</p>
                    <div className="flex gap-2">
                      {[{ key: "preview", label: "预览 (20 epochs)", desc: "~2分钟" },
                        { key: "standard", label: "标准 (100 epochs)", desc: "~10分钟" },
                        { key: "premium", label: "高品质 (200 epochs)", desc: "~20分钟" }]
                        .map(({ key, label, desc }) => (
                          <button key={key} onClick={() => setTrainQualityTarget(key)}
                            className="flex-1 px-3 py-2.5 rounded-xl text-xs text-center transition-all duration-200"
                            style={{
                              background: trainQualityTarget === key ? "var(--accent-soft)" : "var(--bg-primary)",
                              border: trainQualityTarget === key ? "1px solid var(--accent)" : "1px solid var(--border-color)",
                              color: trainQualityTarget === key ? "var(--accent)" : "var(--text-secondary)",
                              fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: "pointer",
                            }}>
                            <div className="font-medium">{label}</div>
                            <div className="text-[10px] mt-0.5 opacity-60">{desc}</div>
                          </button>
                        ))}
                    </div>
                  </div>
                  <button className="btn-primary w-full"
                    disabled={trainAssetIds.length === 0 || !trainVoiceName.trim() || isTraining}
                    onClick={onTrainVoice}>
                    {isTraining ? "提交中..." : "开始训练"}
                  </button>
                </div>
              </div>
            </div>

            <ErrorBoundary>
              <VoiceModelLibrary
                models={voiceModels}
                selectedId={selectedVoiceId || undefined}
                onSelect={(model) => onVoiceSelect(model.id)}
                onDelete={onDeleteVoice}
              />
            </ErrorBoundary>

            {/* Sing generation */}
            {selectedVoiceId && voiceModels.find(m => m.id === selectedVoiceId && m.status === "ready") && (
              <div className="card-outer">
                <div className="card-inner p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="eyebrow">生成</span>
                    <h3 className="text-lg italic font-medium"
                      style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
                      使用已选声音生成
                    </h3>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>参考音频</p>
                    <select className="settings-select" value={singRefAssetId}
                      onChange={(e) => setSingRefAssetId(e.target.value)}
                      style={{ padding: "8px 36px 8px 12px", fontSize: "0.8125rem" }}>
                      <option value="">选择参考音频...</option>
                      {uploadingAssets.filter(a => a.status === "completed").map((a) => (
                        <option key={a.id} value={a.id}>{a.fileName}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn-primary w-full"
                    disabled={!singRefAssetId || isSinging} onClick={onSingVoice}>
                    {isSinging ? "生成中..." : "生成人声"}
                  </button>
                  {singError && <p className="text-xs" style={{ color: "#ef4444" }}>{singError}</p>}
                  {!singError && processingMode === "async" &&
                    <p className="text-[10px] opacity-60" style={{ color: "var(--text-tertiary)" }}>
                      需要 Redis + Celery Worker 运行中
                    </p>}
                </div>
              </div>
            )}

            {/* Vocal generations */}
            {vocalGenerations.length > 0 && (
              <div className="card-outer">
                <div className="card-inner p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="eyebrow">结果</span>
                    <h3 className="text-lg italic font-medium"
                      style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
                      人声生成记录
                    </h3>
                  </div>
                  {vocalGenerations.slice(0, 5).map((gen) => (
                    <div key={gen.id} className="flex items-center justify-between py-2"
                      style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full"
                          style={{ background: gen.status === "completed" ? "#22c55e" : gen.status === "failed" ? "#ef4444" : gen.status === "processing" ? "#e8a840" : "#666" }} />
                        <div>
                          <p className="text-xs" style={{ color: "var(--text-primary)" }}>
                            {gen.status === "completed" ? "生成完成" : gen.status === "failed" ? "生成失败" : gen.status === "processing" ? "生成中..." : "排队中"}
                          </p>
                          <p className="text-[9px] font-mono opacity-60" style={{ color: "var(--text-tertiary)" }}>
                            {gen.durationSeconds > 0 ? `${gen.durationSeconds.toFixed(1)}s` : ""} · {gen.createdAt?.slice(0, 16) || ""}
                          </p>
                        </div>
                      </div>
                      {gen.status === "completed" && gen.outputPath && (
                        <audio controls className="h-7"
                          src={`${API_BASE}/voice/generations/${gen.id}/download`}
                          style={{ maxWidth: "200px" }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Training Pipeline Component ──
const TRAINING_STAGES = [
  { key: "preprocessing", label: "预处理" },
  { key: "training", label: "训练中" },
  { key: "ready", label: "已完成" },
];

function TrainingPipeline({ models }: { models: VoiceModel[] }) {
  const targetEpochsFor = (model: VoiceModel) =>
    model.targetEpochs || (model.qualityTier === "preview" ? 20 : model.qualityTier === "standard" ? 100 : 200);

  const getStageState = (stageKey: string, modelStatus: string) => {
    if (modelStatus === "failed") return "failed";
    const stageIdx = TRAINING_STAGES.findIndex(s => s.key === stageKey);
    const modelIdx = TRAINING_STAGES.findIndex(s => s.key === modelStatus);
    if (stageIdx < modelIdx) return "done";
    if (stageIdx === modelIdx) return "active";
    return "pending";
  };

  return (
    <div className="space-y-2">
      {models.map((model) => (
        <div key={model.id} className="flex items-center gap-2 py-1">
          <span className="text-xs min-w-[80px] truncate" style={{ color: "var(--text-primary)" }}>
            {model.name}
          </span>
          <div className="flex items-center flex-1">
            {TRAINING_STAGES.map((stage, i) => {
              const state = model.status === "failed" && stage.key !== "ready"
                ? (getStageState(stage.key, "preprocessing") === "active" ? "failed" : "done")
                : getStageState(stage.key, model.status);
              return (
                <div key={stage.key} className="flex items-center flex-1">
                  <div className={`stage-node ${state}`}
                    style={{ whiteSpace: "nowrap", padding: "2px 6px", fontSize: "8px" }}>
                    <span className={`w-1.5 h-1.5 rounded-full ${state === "active" ? "animate-pulse" : ""}`}
                      style={{
                        background: state === "done" ? "#22c55e" : state === "active" ? "var(--accent)" : state === "failed" ? "#ef4444" : "var(--text-tertiary)",
                        opacity: state === "pending" ? 0.3 : 1,
                      }} />
                    {stage.label}
                  </div>
                  {i < TRAINING_STAGES.length - 1 && (
                    <div className={`stage-arrow flex-1 ${state === "done" || (state === "active" && TRAINING_STAGES[i + 1]?.key !== model.status) ? "done" : ""}`} />
                  )}
                </div>
              );
            })}
          </div>
          {model.status === "training" && model.epoch > 0 && (
            <span className="text-[8px] font-mono" style={{ color: "var(--text-tertiary)" }}>
              {model.epoch}/{targetEpochsFor(model)}
            </span>
          )}
          {model.status === "failed" && (
            <span className="text-[8px] font-mono" style={{ color: "#ef4444" }}>失败</span>
          )}
        </div>
      ))}
    </div>
  );
}
