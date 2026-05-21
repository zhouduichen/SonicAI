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
  preview: "Preview",
  standard: "Standard",
  premium: "Premium",
};

export default function VoiceModelLibrary({ models, onSelect, onDelete, selectedId }: VoiceModelLibraryProps) {
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
          <span className="text-[10px] font-mono tracking-[0.15em]"
            style={{ color: "var(--text-tertiary)" }}>
            {models.length} 个声音
          </span>
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
                const subLabel = model.status === "training"
                  ? `TRAINING · ${model.epoch}/200 epoch`
                  : `${QUALITY_LABELS[model.qualityTier] || model.qualityTier} · ${model.epoch} epochs · ${Math.round(model.durationSeconds)}s`;
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
                    </div>

                    {active && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: "var(--accent)", color: "#0d0d0d" }}>
                        {QUALITY_LABELS[model.qualityTier] || model.qualityTier}
                      </span>
                    )}

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
