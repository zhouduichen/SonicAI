export interface AudioAsset {
  id: string;
  fileName: string;
  filePath: string;
  status: "uploading" | "processing" | "completed" | "failed";
  uploadedAt: string;
  vocalSepModel?: string;
}

export interface StyleTag {
  id: string;
  name: string;
  assetId: string;
  embedding: number[];
  styleExtractModel?: string;
  createdAt: string;
}

export interface GeneratedMusic {
  id: string;
  title: string;
  prompt: string;
  styleName: string;
  filePath: string;
  duration: number;
  musicGenModel?: string;
  createdAt: string;
  isPlaying?: boolean;
}

export interface TaskStatus {
  taskId: string;
  stage: "separating" | "extracting" | "generating" | "completed" | "failed";
  progress: number;
  message: string;
}

export interface User {
  username: string;
  token: string;
}

export interface ModelInfo {
  key: string;
  display_name: string;
  description: string;
  vram_gb: number;
  quality: string;
  speed: string;
  embedding_dim?: number;
  pros: string[];
  cons: string[];
}

export interface ModelCatalog {
  vocal_separation: ModelInfo[];
  style_extraction: ModelInfo[];
  music_generation: ModelInfo[];
}

export interface ModelSelection {
  vocalSepModel: string;
  styleExtractModel: string;
  musicGenModel: string;
}

export type HardwareTier = "ultra" | "high" | "mid" | "low" | "cpu";

export type PreferenceMode = "speed" | "quality";

// File System Access API
declare global {
  interface Window {
    showDirectoryPicker(options?: { mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemDirectoryHandle {
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  }
  interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>;
  }
}

export interface HardwareTierConfig {
  tier: HardwareTier;
  label: string;
  maxVramGB: number;
  presets: Record<PreferenceMode, ModelSelection>;
}

export interface VoiceModel {
  id: string;
  name: string;
  sourceAudioId: string;
  status: "pending" | "preprocessing" | "training" | "ready" | "failed";
  epoch: number;
  qualityTier: "preview" | "standard" | "premium";
  durationSeconds: number;
  createdAt: string;
}

export interface VocalGeneration {
  id: string;
  voiceModelId: string;
  outputPath: string;
  status: "pending" | "processing" | "completed" | "failed";
  durationSeconds: number;
  createdAt: string;
}
