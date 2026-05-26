"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, Disc, CheckCircle, WarningCircle, MicrophoneStage, Waveform, Trash, File } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import type { AudioAsset, ModelInfo } from "@/types";
import ModelSelector from "./ModelSelector";

interface DropzoneProps {
  onUpload: (file: File) => Promise<void>;
  onDeleteAsset?: (assetId: string) => void;
  asset?: AudioAsset | null;
  assets?: AudioAsset[];
  vocalSepModel: string;
  styleExtractModel: string;
  onVocalSepModelChange: (model: string) => void;
  onStyleExtractModelChange: (model: string) => void;
  vocalSepModels: ModelInfo[];
  styleExtractModels: ModelInfo[];
}

const AUDIO_EXTENSIONS = /\.(mp3|wav|flac|m4a|ogg|aac|wma)$/i;

function isValidAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || AUDIO_EXTENSIONS.test(file.name);
}

export default function Dropzone({
  onUpload, onDeleteAsset, asset, assets, vocalSepModel, styleExtractModel,
  onVocalSepModelChange, onStyleExtractModelChange,
  vocalSepModels, styleExtractModels,
}: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const mainFileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(isValidAudioFile);
    if (validFiles.length === 0) return;
    setIsUploading(true);
    try {
      for (const file of validFiles) {
        await onUpload(file);
      }
    } finally {
      setIsUploading(false);
    }
  }, [onUpload]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await uploadFiles(e.dataTransfer.files);
  }, [uploadFiles]);

  const handleChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    try {
      if (files && files.length > 0) {
        await uploadFiles(files);
      }
    } finally {
      e.target.value = "";
    }
  }, [uploadFiles]);

  const borderColor = isDragging ? "var(--accent)" : "var(--border-color)";

  const allAssets = assets || (asset ? [asset] : []);
  const completedAssets = allAssets.filter((a) => a.status === "completed");
  const processingAssets = allAssets.filter((a) => a.status === "processing");
  const failedAssets = allAssets.filter((a) => a.status === "failed");
  const hasAnyUpload = allAssets.length > 0;
  const canPickFiles = !isUploading && processingAssets.length === 0;
  const openFilePicker = useCallback(() => {
    if (!canPickFiles) return;
    mainFileInputRef.current?.click();
  }, [canPickFiles]);

  let summaryState: "idle" | "uploading" | "processing" | "mixed" = "idle";
  if (isUploading) summaryState = "uploading";
  else if (hasAnyUpload) {
    if (processingAssets.length > 0) summaryState = "processing";
    else if (completedAssets.length === allAssets.length) summaryState = "idle";
    else if (failedAssets.length > 0) summaryState = "mixed";
  }

  const displayAsset = allAssets.find((a) => a.status === "processing") ||
    allAssets.find((a) => a.status === "failed") ||
    (allAssets.length > 0 ? allAssets[allAssets.length - 1] : null);

  // Simple asset row renderer
  const AssetRow = ({ item }: { item: AudioAsset }) => {
    const statusColors: Record<string, string> = {
      completed: "#22c55e", processing: "#e8a840", uploading: "#e8a840", failed: "#ef4444",
    };
    const statusLabels: Record<string, string> = {
      completed: "已完成", processing: "处理中", uploading: "上传中", failed: "失败",
    };
    const retryInputRef = useRef<HTMLInputElement>(null);
    const canReupload = item.status === "failed" || item.status === "completed";
    return (
      <div key={item.id} className="asset-row">
        <div className="w-6 h-6 flex items-center justify-center shrink-0"
          style={{ color: statusColors[item.status] || "#666" }}>
          {item.status === "processing" ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
              <Disc size={12} />
            </motion.div>
          ) : item.status === "completed" ? (
            <CheckCircle size={12} weight="fill" />
          ) : item.status === "failed" ? (
            <WarningCircle size={12} weight="fill" />
          ) : (
            <File size={12} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs truncate" style={{ color: "var(--text-primary)" }}>{item.fileName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="status-badge" style={{
              background: `${statusColors[item.status]}15`,
              color: statusColors[item.status],
              border: `1px solid ${statusColors[item.status]}30`,
            }}>
              {statusLabels[item.status] || item.status}
            </span>
            {item.status === "completed" && (
              <span className="text-[8px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                风格已提取
              </span>
            )}
          </div>
        </div>
        {canReupload && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => retryInputRef.current?.click()}
              className="p-1 rounded-full transition-colors hover:bg-[rgba(34,197,94,0.1)]"
              style={{ color: "var(--text-tertiary)" }}
              title={item.status === "failed" ? "重新上传" : "再次上传"}
            >
              <Upload size={11} />
            </button>
            {onDeleteAsset && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`删除 "${item.fileName}"？`)) onDeleteAsset(item.id);
                }}
                className="p-1 rounded-full transition-colors hover:bg-[rgba(239,68,68,0.1)]"
                style={{ color: "var(--text-tertiary)" }}
              >
                <Trash size={12} />
              </button>
            )}
            <input
              ref={retryInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg,.aac,.wma"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                try {
                  if (file) {
                    await onUpload(file);
                    onDeleteAsset?.(item.id);
                  }
                } finally {
                  e.target.value = "";
                }
              }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card-outer">
      <div className="card-inner p-6 relative overflow-hidden">
        {/* Model selectors */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <ModelSelector
            label="人声分离模型"
            options={vocalSepModels}
            selected={vocalSepModel}
            onChange={onVocalSepModelChange}
            icon={<MicrophoneStage size={14} style={{ color: "var(--text-tertiary)" }} />}
          />
          <ModelSelector
            label="风格提取模型"
            options={styleExtractModels}
            selected={styleExtractModel}
            onChange={onStyleExtractModelChange}
            icon={<Waveform size={14} style={{ color: "var(--text-tertiary)" }} />}
          />
        </div>

        {/* Upload drop area */}
        <div
          onClick={openFilePicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openFilePicker();
            }
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={canPickFiles ? 0 : -1}
          aria-disabled={!canPickFiles}
          className={`relative border-2 border-dashed transition-all duration-500 flex flex-col items-center justify-center gap-4 py-5 ${canPickFiles ? "cursor-pointer" : "cursor-default"}`}
          style={{
            background: isDragging ? "var(--accent-soft)" : "var(--bg-primary)",
            borderColor,
            borderRadius: 12,
          }}
        >
          <input
            ref={mainFileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg,.aac,.wma"
            className="hidden"
            onChange={handleChange}
            multiple
          />
          <AnimatePresence mode="wait">
            {summaryState === "processing" && displayAsset ? (
              <motion.div key="processing" animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-3">
                <div className="flex items-end gap-[2px] h-8">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className="wave-bar w-[3px] animate-waveform"
                      style={{ background: "var(--accent)" }} />
                  ))}
                </div>
                <p className="text-sm font-mono tracking-[0.08em] uppercase" style={{ color: "var(--accent)" }}>
                  {processingAssets.length > 1 ? `分析 ${processingAssets.length} 个音频中...` : "分析音频中..."}
                </p>
              </motion.div>
            ) : summaryState === "mixed" && displayAsset ? (
              <motion.div key="error" animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rotate-45 flex items-center justify-center"
                  style={{ border: "1.5px solid #ef4444" }}>
                  <WarningCircle size={18} weight="fill" className="-rotate-45" style={{ color: "#ef4444" }} />
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {failedAssets.length} 个处理失败
                </p>
                <p className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>请重新上传</p>
              </motion.div>
            ) : hasAnyUpload && completedAssets.length === allAssets.length && !isUploading ? (
              <motion.div key="success" initial={{ scale: 0.9 }} animate={{ scale: 1 }}
                className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rotate-45 flex items-center justify-center"
                  style={{ background: "var(--accent-soft)", border: "1.5px solid var(--accent)" }}>
                  <CheckCircle size={18} weight="fill" className="-rotate-45" style={{ color: "#22c55e" }} />
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {completedAssets.length} 个风格已提取
                </p>
                <p className="text-xs font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  点击继续上传
                </p>
              </motion.div>
            ) : (
              <motion.div key="idle" animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-4">
                <div className="relative w-14 h-14 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full"
                    style={{ background: "var(--bg-tertiary)", border: "1.5px solid var(--border-color)" }} />
                  <div className="absolute inset-2 rounded-full"
                    style={{ border: "1px dashed var(--accent)", opacity: 0.4 }} />
                  {isUploading ? (
                    <motion.div animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                      <Disc size={22} weight="fill" style={{ color: "var(--accent)" }} />
                    </motion.div>
                  ) : (
                    <Upload size={20} className="relative z-10" style={{ color: "var(--text-tertiary)" }} />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-sm tracking-wider italic"
                    style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
                    拖拽音频文件到此处
                  </p>
                  <p className="text-[10px] font-mono tracking-[0.1em] uppercase mt-1"
                    style={{ color: "var(--text-tertiary)" }}>
                    MP3 · WAV · FLAC · M4A · OGG
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary cursor-pointer text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFilePicker();
                  }}
                >
                  <Upload size={12} weight="bold" />
                  <span>选择文件</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Asset List ── */}
        {allAssets.length > 0 && (
          <div className="mt-4 space-y-3">
            {/* Completed */}
            {completedAssets.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <CheckCircle size={10} style={{ color: "#22c55e" }} />
                  <span className="text-[9px] font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                    已完成 ({completedAssets.length})
                  </span>
                </div>
                <div className="space-y-0.5">
                  {completedAssets.map((a) => <AssetRow key={a.id} item={a} />)}
                </div>
              </div>
            )}

            {/* Processing */}
            {processingAssets.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#e8a840" }} />
                  <span className="text-[9px] font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                    处理中 ({processingAssets.length})
                  </span>
                </div>
                <div className="space-y-0.5">
                  {processingAssets.map((a) => <AssetRow key={a.id} item={a} />)}
                </div>
              </div>
            )}

            {/* Failed */}
            {failedAssets.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <WarningCircle size={10} style={{ color: "#ef4444" }} />
                  <span className="text-[9px] font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                    失败 ({failedAssets.length})
                  </span>
                </div>
                <div className="space-y-0.5">
                  {failedAssets.map((a) => <AssetRow key={a.id} item={a} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
