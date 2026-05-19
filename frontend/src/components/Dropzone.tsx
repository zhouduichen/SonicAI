"use client";

import { useState, useCallback } from "react";
import { Upload, Disc, CheckCircle, WarningCircle, MicrophoneStage, Waveform } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import type { AudioAsset, ModelInfo } from "@/types";
import ModelSelector from "./ModelSelector";

interface DropzoneProps {
  onUpload: (file: File, vocalSepModel: string, styleExtractModel: string) => Promise<void>;
  asset?: AudioAsset | null;
  vocalSepModel: string;
  styleExtractModel: string;
  onVocalSepModelChange: (model: string) => void;
  onStyleExtractModelChange: (model: string) => void;
  vocalSepModels: ModelInfo[];
  styleExtractModels: ModelInfo[];
}

export default function Dropzone({
  onUpload, asset, vocalSepModel, styleExtractModel,
  onVocalSepModelChange, onStyleExtractModelChange,
  vocalSepModels, styleExtractModels,
}: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith("audio/") || file.name.match(/\.(mp3|wav|flac|m4a|ogg)$/i))) {
      setIsUploading(true);
      await onUpload(file, vocalSepModel, styleExtractModel);
      setIsUploading(false);
    }
  }, [onUpload, vocalSepModel, styleExtractModel]);

  const handleChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      await onUpload(file, vocalSepModel, styleExtractModel);
      setIsUploading(false);
    }
  }, [onUpload, vocalSepModel, styleExtractModel]);

  const borderColor = isDragging ? "var(--accent)" : "var(--border-color)";

  return (
    <div className="card-outer">
      <div className="card-inner p-8 relative overflow-hidden">
        {/* Corner ornaments */}
        <div className="absolute top-0 left-0 w-8 h-8" style={{
          borderTop: "2px solid var(--accent)",
          borderLeft: "2px solid var(--accent)",
          opacity: 0.35,
        }} />
        <div className="absolute top-0 right-0 w-8 h-8" style={{
          borderTop: "2px solid var(--accent)",
          borderRight: "2px solid var(--accent)",
          opacity: 0.35,
        }} />
        <div className="absolute bottom-0 left-0 w-8 h-8" style={{
          borderBottom: "2px solid var(--accent)",
          borderLeft: "2px solid var(--accent)",
          opacity: 0.35,
        }} />
        <div className="absolute bottom-0 right-0 w-8 h-8" style={{
          borderBottom: "2px solid var(--accent)",
          borderRight: "2px solid var(--accent)",
          opacity: 0.35,
        }} />

        {["top-3", "bottom-3"].map((v) =>
          ["left-[35%]", "right-[35%]"].map((h) => (
            <div key={v + h} className={`absolute ${v} ${h} w-1.5 h-1.5 rotate-45`}
              style={{ background: "var(--accent)", opacity: 0.12 }} />
          ))
        )}

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

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className="relative border-2 border-dashed transition-all duration-500 cursor-pointer flex flex-col items-center justify-center gap-5 py-6"
          style={{
            background: isDragging ? "var(--accent-soft)" : "var(--bg-primary)",
            borderColor,
            borderRadius: 12,
          }}
        >
          <AnimatePresence mode="wait">
            {asset?.status === "completed" ? (
              <motion.div
                key="success"
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-14 h-14 rotate-45 flex items-center justify-center"
                  style={{ background: "var(--accent-soft)", border: "1.5px solid var(--accent)" }}>
                  <CheckCircle size={22} weight="fill" className="-rotate-45" style={{ color: "#22c55e" }} />
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{asset.fileName}</p>
                <p className="text-xs font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  风格向量已提取
                </p>
              </motion.div>
            ) : asset?.status === "processing" ? (
              <motion.div key="processing" animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-5">
                <div className="flex items-end gap-[2px] h-10">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className="wave-bar w-[3px] animate-waveform"
                      style={{ background: "var(--accent)" }} />
                  ))}
                </div>
                <p className="text-sm font-mono tracking-[0.08em] uppercase" style={{ color: "var(--accent)" }}>
                  分析音频中...
                </p>
              </motion.div>
            ) : asset?.status === "failed" ? (
              <motion.div key="error" animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rotate-45 flex items-center justify-center"
                  style={{ border: "1.5px solid #ef4444" }}>
                  <WarningCircle size={22} weight="fill" className="-rotate-45" style={{ color: "#ef4444" }} />
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>处理失败</p>
                <p className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>请重新上传</p>
              </motion.div>
            ) : (
              <motion.div key="idle" animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-5">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full"
                    style={{ background: "var(--bg-tertiary)", border: "1.5px solid var(--border-color)" }} />
                  <div className="absolute inset-2 rounded-full"
                    style={{ border: "1px dashed var(--accent)", opacity: 0.4 }} />
                  {isUploading ? (
                    <motion.div animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                      <Disc size={26} weight="fill" style={{ color: "var(--accent)" }} />
                    </motion.div>
                  ) : (
                    <Upload size={24} weight="regular" className="relative z-10" style={{ color: "var(--text-tertiary)" }} />
                  )}
                </div>

                <div className="text-center">
                  <p className="text-sm tracking-wider italic"
                    style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
                    拖拽音频文件到此处
                  </p>
                  <p className="text-[10px] font-mono tracking-[0.1em] uppercase mt-2"
                    style={{ color: "var(--text-tertiary)" }}>
                    MP3 &middot; WAV &middot; FLAC &middot; M4A &middot; OGG
                  </p>
                </div>

                <label className="btn-primary cursor-pointer text-xs">
                  <Upload size={14} weight="bold" />
                  <span>选择音频文件</span>
                  <input type="file" accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg"
                    className="hidden" onChange={handleChange} />
                </label>

                <p className="text-[11px] text-center leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                  第 1 步：上传音频 → 自动提取音乐风格特征
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
