"use client";

import { motion } from "framer-motion";
import { GridFour, Sparkle, ArrowRight } from "@phosphor-icons/react";
import BatchConsole from "./BatchConsole";
import MusicPlayer from "./MusicPlayer";
import ErrorBoundary from "./ErrorBoundary";
import type { GeneratedMusic, ModelInfo, StyleTag } from "@/types";

interface BatchCell {
  task_id: string;
  prompt: string;
  model: string;
  status: string;
  file_path?: string;
}

interface LabWorkspaceProps {
  musicGenModels: ModelInfo[];
  onBatchGenerate: (prompts: string[], models: string[]) => Promise<void>;
  isBatchGenerating: boolean;
  batchCells: BatchCell[];
  batchPlayingCell: string | null;
  onBatchPlayCell: (taskId: string, filePath: string) => void;
  selectedStyle: StyleTag | null;
  currentPlayingMusic: GeneratedMusic | null;
  suggestions?: string[];
}

export default function LabWorkspace({
  musicGenModels, onBatchGenerate, isBatchGenerating,
  batchCells, batchPlayingCell, onBatchPlayCell,
  currentPlayingMusic, selectedStyle, suggestions = [],
}: LabWorkspaceProps) {
  return (
    <div className="space-y-5">
      <span className="eyebrow mb-2 inline-block">LAB</span>
      <h2 className="text-3xl italic font-medium mt-1 tracking-tight"
        style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
        实验室
      </h2>
      <div className="flex items-center gap-3 mt-3 mb-5">
        <div className="w-8 h-px" style={{ background: "var(--accent)", opacity: 0.4 }} />
        <div className="w-1 h-1 rotate-45" style={{ background: "var(--accent)", opacity: 0.3 }} />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          多个提示词 × 多个模型，一键生成对比矩阵
        </p>
      </div>

      {!selectedStyle && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl max-w-4xl"
          style={{ background: "var(--accent-soft)", border: "1px solid rgba(212,168,83,0.2)" }}>
          <Sparkle size={16} weight="fill" style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
              选择一个风格开始批量实验
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
              前往「创作台」选择一个风格标签，或前往「素材库」上传音频提取风格
            </p>
          </div>
        </div>
      )}

      <div className="max-w-4xl space-y-5">
        <ErrorBoundary>
          <BatchConsole
            musicGenModels={musicGenModels}
            onGenerate={onBatchGenerate}
            isGenerating={isBatchGenerating}
            cells={batchCells}
            currentPlayingCell={batchPlayingCell}
            onPlayCell={onBatchPlayCell}
            suggestions={suggestions}
          />
        </ErrorBoundary>
        {currentPlayingMusic && batchPlayingCell && (
          <ErrorBoundary>
            <MusicPlayer music={currentPlayingMusic} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
