"use client";

import { Trash, Microphone } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import type { VoiceModel } from "@/types";

interface VoiceModelLibraryProps {
  models: VoiceModel[];
  onSelect: (model: VoiceModel) => void;
  onDelete: (id: string) => void;
  selectedId?: string;
}

const QUALITY_LABELS: Record<string, string> = {
  preview: "预览",
  standard: "标准",
  premium: "高品质",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "排队中", color: "#888", bg: "rgba(136,136,136,0.12)" },
  preprocessing: { label: "预处理", color: "#e8a840", bg: "rgba(232,168,64,0.12)" },
  training: { label: "训练中", color: "var(--accent)", bg: "var(--accent-soft)" },
  ready: { label: "就绪", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  failed: { label: "失败", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

export default function VoiceModelLibrary({ models, onSelect, onDelete, selectedId }: VoiceModelLibraryProps) {
  const inTrainingCount = models.filter(m => m.status === "training" || m.status === "preprocessing").length;

  return (
    <div className="card-outer">
      <div className="card-inner p-6 space-y-5 relative overflow-hidden">
        {/* Top deco */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, var(--accent), transparent)" }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ background: "var(--accent)", opacity: 0.4 }} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="eyebrow">声音模型</span>
            <h3 className="text-lg italic font-medium"
              style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
              声音模型库
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {inTrainingCount > 0 && (
              <span className="flex items-center gap-1 text-[9px] font-mono" style={{ color: "var(--accent)" }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
                {inTrainingCount} 训练中
              </span>
            )}
            <span className="text-[10px] font-mono tracking-[0.15em]"
              style={{ color: "var(--text-tertiary)" }}>
              {models.length} 个声音
            </span>
          </div>
        </div>

        {models.length === 0 ? (
          <div className="py-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rotate-45 flex items-center justify-center"
              style={{ border: "1.5px dashed var(--border-color)" }}>
              <Microphone size={18} weight="regular" className="-rotate-45" style={{ color: "var(--text-tertiary)" }} />
            </div>
            <p className="text-sm italic" style={{ color: "var(--text-secondary)", fontFamily: "'Playfair Display', serif" }}>
              暂无声音模型
            </p>
            <p className="text-xs mt-1 font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              上传多首歌曲训练你的专属声音
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence>
              {models.map((model) => {
                const active = selectedId === model.id;
                const statusCfg = STATUS_CONFIG[model.status] || STATUS_CONFIG.pending;
                const isReady = model.status === "ready";
                const isBusy = model.status === "training" || model.status === "preprocessing";
                const isFailed = model.status === "failed";
                const targetEpochs = model.targetEpochs || (model.qualityTier === "preview" ? 20 : model.qualityTier === "standard" ? 100 : 200);
                const percent = Math.round((model.epoch / targetEpochs) * 100);
                const subLabel = isFailed
                  ? `失败 · ${Math.round(model.durationSeconds)}s`
                  : isReady
                    ? `${QUALITY_LABELS[model.qualityTier] || model.qualityTier} · ${model.epoch} epoch · ${Math.round(model.durationSeconds)}s`
                    : model.status === "training"
                      ? `训练中 · ${model.epoch}/${targetEpochs} epoch (${percent}%)`
                      : model.status === "preprocessing"
                        ? "预处理中..."
                        : "排队中";
                return (
                  <motion.div
                    key={model.id}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.25 }}
                    onClick={() => onSelect(model)}
                    className="group flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-300"
                    style={{
                      background: active ? "var(--accent-soft)" : "transparent",
                      borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                      borderRadius: 8,
                    }}
                  >
                    <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
                      <div className="absolute inset-0 rounded-full"
                        style={{
                          background: active ? "var(--accent-soft)" : "var(--bg-tertiary)",
                          border: active ? "1.5px solid var(--accent)" : "1px solid var(--border-color)",
                        }} />
                      <Microphone size={14} weight={active ? "fill" : "regular"}
                        style={{ color: active ? "var(--accent)" : "var(--text-tertiary)" }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate"
                        style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}>
                        {model.name}
                      </p>
                      <p className="text-[10px] font-mono tracking-wider"
                        style={{ color: "var(--text-tertiary)" }}>
                        {subLabel}
                      </p>
                      {/* Progress bar for training */}
                      {model.status === "training" && (
                        <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-hover)" }}>
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min((model.epoch / targetEpochs) * 100, 100)}%`,
                              background: "var(--deco-gradient)",
                            }} />
                        </div>
                      )}
                    </div>

                    {/* Status badge */}
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-full shrink-0"
                      style={{
                        background: statusCfg.bg,
                        color: statusCfg.color,
                        border: `1px solid ${statusCfg.color}`,
                        opacity: isBusy ? 1 : 0.8,
                      }}>
                      {isBusy && <span className="inline-block w-1 h-1 rounded-full mr-1 animate-pulse" style={{ background: statusCfg.color }} />}
                      {statusCfg.label}
                    </span>

                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(model.id); }}
                      className="p-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-full"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      <Trash size={14} weight="regular" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Bottom deco */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to left, var(--accent), transparent)" }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ background: "var(--accent)", opacity: 0.4 }} />
        </div>
      </div>
    </div>
  );
}
