"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "@/components/Sidebar";
import Dropzone from "@/components/Dropzone";
import StyleLibrary from "@/components/StyleLibrary";
import GenerationConsole from "@/components/GenerationConsole";
import MusicPlayer from "@/components/MusicPlayer";
import Playlist from "@/components/Playlist";
import BatchConsole from "@/components/BatchConsole";
import BlendPanel from "@/components/BlendPanel";
import VoiceModelLibrary from "@/components/VoiceModelLibrary";
import ErrorBoundary from "@/components/ErrorBoundary";
import SettingsPanel from "@/components/SettingsPanel";
import { getTierConfig } from "@/lib/hardware-tiers";
import type { AudioAsset, StyleTag, GeneratedMusic, VoiceModel, HardwareTier, PreferenceMode } from "@/types";
import {
  DEFAULT_VOCAL_SEPARATION_MODELS,
  DEFAULT_STYLE_EXTRACTION_MODELS,
  DEFAULT_MUSIC_GENERATION_MODELS,
} from "@/lib/default-models";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

let cachedToken: string | null = null;

async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  if (!res.ok) throw new Error("Auth failed");
  const data = await res.json();
  cachedToken = data.access_token || null;
  if (!cachedToken) throw new Error("No token in auth response");
  return cachedToken;
}

async function authHeaders(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await getToken()}` };
}

async function uploadAudio(
  file: File,
  vocalSepModel: string,
  styleExtractModel: string,
): Promise<{ asset_id: number; task_id: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("vocal_sep_model", vocalSepModel);
  formData.append("style_extract_model", styleExtractModel);
  const res = await fetch(`${API_BASE}/audio/upload`, {
    method: "POST",
    body: formData,
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

async function pollAudioStatus(taskId: string) {
  const res = await fetch(`${API_BASE}/audio/status/${taskId}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Status check failed");
  return res.json();
}

async function apiGenerateMusic(
  vectorId: number,
  prompt: string,
  musicGenModel: string,
): Promise<{ task_id: string }> {
  const res = await fetch(`${API_BASE}/music/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ style_vector_id: vectorId, text_prompt: prompt, music_gen_model: musicGenModel }),
  });
  if (!res.ok) throw new Error("Generation failed");
  return res.json();
}

async function pollMusicStatus(taskId: string) {
  const res = await fetch(`${API_BASE}/music/status/${taskId}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Music status check failed");
  return res.json();
}

async function apiBlendGenerate(
  blends: { style_vector_id: number; weight: number }[],
  prompt: string,
  musicGenModel: string,
): Promise<{ task_id: string }> {
  const res = await fetch(`${API_BASE}/music/blend-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ blends, text_prompt: prompt, music_gen_model: musicGenModel }),
  });
  if (!res.ok) throw new Error("Blend generation failed");
  return res.json();
}

async function apiBatchGenerate(
  styleVectorId: number,
  prompts: string[],
  models: string[],
): Promise<{ batch_id: string; tasks: { task_id: string; prompt: string; model: string }[] }> {
  const res = await fetch(`${API_BASE}/music/generate-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ style_vector_id: styleVectorId, prompts, music_gen_models: models }),
  });
  if (!res.ok) throw new Error("Batch generation failed");
  return res.json();
}

async function pollBatchStatus(batchId: string) {
  const res = await fetch(`${API_BASE}/music/batch/${batchId}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Batch status check failed");
  return res.json();
}

async function apiGetVoiceModels(): Promise<VoiceModel[]> {
  const res = await fetch(`${API_BASE}/voice/models`, { headers: await authHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || []).map((item: any) => ({
    id: String(item.id),
    name: item.name,
    sourceAudioId: String(item.source_audio_id || ""),
    status: item.status,
    epoch: item.epoch || 0,
    qualityTier: item.quality_tier || "preview",
    durationSeconds: item.duration_seconds || 0,
    createdAt: item.created_at || "",
  }));
}

async function apiTrainVoice(audioAssetId: number, name: string, qualityTarget: string): Promise<{ model_id: number }> {
  const res = await fetch(`${API_BASE}/voice/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ audio_asset_id: audioAssetId, name, quality_target: qualityTarget }),
  });
  if (!res.ok) throw new Error("Voice training failed");
  return res.json();
}

async function apiDeleteVoiceModel(modelId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/voice/models/${modelId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  return res.ok;
}

async function apiPollVoiceStatus(modelId: string): Promise<{ status: string; current_epoch: number; available_tiers: string[] }> {
  const res = await fetch(`${API_BASE}/voice/status/${modelId}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error("Status check failed");
  return res.json();
}

async function apiSingVoice(voiceModelId: string, referenceAudioId: string): Promise<{ generation_id: number }> {
  const res = await fetch(`${API_BASE}/voice/sing`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ voice_model_id: Number(voiceModelId), reference_audio_id: Number(referenceAudioId) }),
  });
  if (!res.ok) throw new Error("Vocal generation failed");
  return res.json();
}

export default function CreatePage() {
  const [activeTab, setActiveTab] = useState("studio");
  const [uploadingAssets, setUploadingAssets] = useState<AudioAsset[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<StyleTag | null>(null);
  const [voiceModels, setVoiceModels] = useState<VoiceModel[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | undefined>(undefined);
  const [trainVoiceName, setTrainVoiceName] = useState("");
  const [trainQualityTarget, setTrainQualityTarget] = useState("premium");
  const [trainAssetId, setTrainAssetId] = useState("");
  const [isTraining, setIsTraining] = useState(false);
  const [singRefAssetId, setSingRefAssetId] = useState("");
  const [isSinging, setIsSinging] = useState(false);

  // Model selection — controlled by user, sent to backend
  const [vocalSepModel, setVocalSepModel] = useState("demucs_htdemucs");
  const [styleExtractModel, setStyleExtractModel] = useState("clap_laion");
  const [musicGenModel, setMusicGenModel] = useState("musicgen_small");
  const [blendMusicGenModel, setBlendMusicGenModel] = useState("musicgen_small");

  // Start empty — all data comes from the backend
  const [styles, setStyles] = useState<StyleTag[]>([]);
  const [playlist, setPlaylist] = useState<GeneratedMusic[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);

  const [showSettings, setShowSettings] = useState(false);

  const [hardwareTier, setHardwareTier] = useState<HardwareTier>("mid");
  const [preference, setPreference] = useState<PreferenceMode>("speed");

  const [isBlendGenerating, setIsBlendGenerating] = useState(false);

  // Batch state
  const [batchCells, setBatchCells] = useState<
    { task_id: string; prompt: string; model: string; status: string; file_path?: string }[]
  >([]);
  const [batchPlayingCell, setBatchPlayingCell] = useState<string | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);

  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [currentPlayingMusic, setCurrentPlayingMusic] = useState<GeneratedMusic | null>(null);

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

  const handleUpload = useCallback(async (file: File) => {
    const tempId = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    const newAsset: AudioAsset = {
      id: tempId,
      fileName: file.name,
      filePath: "",
      status: "processing",
      uploadedAt: new Date().toISOString(),
    };

    setUploadingAssets((prev) => [...prev, newAsset]);

    try {
      const { asset_id, task_id } = await uploadAudio(file, vocalSepModel, styleExtractModel);
      setUploadingAssets((prev) =>
        prev.map((a) => (a.id === tempId ? { ...a, id: String(asset_id) } : a))
      );

      const interval = setInterval(async () => {
        try {
          const status = await pollAudioStatus(task_id);
          if (status.stage === "completed" && status.style_vector) {
            clearInterval(interval);
            setUploadingAssets((prev) =>
              prev.map((a) => (a.id === String(asset_id) ? { ...a, status: "completed" } : a))
            );
            const sv = status.style_vector;
            const newStyle: StyleTag = {
              id: String(sv.id),
              name: sv.style_name,
              assetId: String(sv.asset_id),
              embedding: [],
              styleExtractModel: sv.style_extract_model,
              createdAt: new Date().toISOString().split("T")[0],
            };
            setStyles((prev) => {
              if (prev.some((s) => s.id === newStyle.id)) return prev;
              return [...prev, newStyle];
            });
            setSelectedStyle((prev) => prev || newStyle);
          } else if (status.stage === "failed") {
            clearInterval(interval);
            setUploadingAssets((prev) =>
              prev.map((a) => (a.id === String(asset_id) ? { ...a, status: "failed" } : a))
            );
          }
        } catch { /* keep polling */ }
      }, 2000);
      setTimeout(() => {
        clearInterval(interval);
        setUploadingAssets((prev) =>
          prev.map((a) =>
            a.id === String(asset_id) && a.status === "processing" ? { ...a, status: "failed" } : a
          )
        );
      }, 120000);
    } catch {
      setUploadingAssets((prev) =>
        prev.map((a) => (a.id === tempId ? { ...a, status: "failed" } : a))
      );
    }
  }, [vocalSepModel, styleExtractModel]);

  const handleGenerate = useCallback(async (prompt: string) => {
    if (!selectedStyle) return;
    setIsGenerating(true);
    try {
      const { task_id } = await apiGenerateMusic(Number(selectedStyle.id), prompt, musicGenModel);
      const interval = setInterval(async () => {
        try {
          const status = await pollMusicStatus(task_id);
          if (status.stage === "completed" && status.music_id) {
            clearInterval(interval);
            setIsGenerating(false);
            const newMusic: GeneratedMusic = {
              id: String(status.music_id),
              title: status.title || prompt.slice(0, 30),
              prompt,
              styleName: selectedStyle.name,
              filePath: status.file_path || "",
              duration: status.duration_seconds || 0,
              musicGenModel: status.music_gen_model || musicGenModel,
              createdAt: new Date().toISOString().split("T")[0],
            };
            setPlaylist((prev) => [newMusic, ...prev]);
            setCurrentPlayingMusic(newMusic);
            setCurrentPlayingId(newMusic.id);
          } else if (status.stage === "failed") {
            clearInterval(interval);
            setIsGenerating(false);
          }
        } catch { /* keep polling */ }
      }, 2000);
      setTimeout(() => clearInterval(interval), 300000);
    } catch {
      setIsGenerating(false);
    }
  }, [selectedStyle, musicGenModel]);

  const handlePlay = useCallback((music: GeneratedMusic) => {
    setCurrentPlayingMusic(music);
    setCurrentPlayingId(music.id === currentPlayingId ? null : music.id);
  }, [currentPlayingId]);

  // ---- Prev/Next ----
  const currentIndex = useMemo(
    () => playlist.findIndex((m) => m.id === currentPlayingMusic?.id),
    [playlist, currentPlayingMusic],
  );

  const handlePrev = useCallback(() => {
    if (currentIndex < playlist.length - 1) {
      const prev = playlist[currentIndex + 1];
      setCurrentPlayingMusic(prev);
      setCurrentPlayingId(prev.id);
    }
  }, [currentIndex, playlist]);

  const handleNext = useCallback(() => {
    if (currentIndex > 0) {
      const next = playlist[currentIndex - 1];
      setCurrentPlayingMusic(next);
      setCurrentPlayingId(next.id);
    }
  }, [currentIndex, playlist]);

  // ---- Blend generation ----
  const handleBlendGenerate = useCallback(async (
    blends: { style_vector_id: number; weight: number }[],
    prompt: string,
  ) => {
    setIsBlendGenerating(true);
    try {
      const { task_id } = await apiBlendGenerate(blends, prompt, blendMusicGenModel);
      const interval = setInterval(async () => {
        try {
          const status = await pollMusicStatus(task_id);
          if (status.stage === "completed" && status.music_id) {
            clearInterval(interval);
            setIsBlendGenerating(false);
            const newMusic: GeneratedMusic = {
              id: String(status.music_id),
              title: status.title || `[混合] ${prompt.slice(0, 25)}`,
              prompt,
              styleName: `混合 (${blends.length} 风格)`,
              filePath: status.file_path || "",
              duration: status.duration_seconds || 0,
              musicGenModel: status.music_gen_model || blendMusicGenModel,
              createdAt: new Date().toISOString().split("T")[0],
            };
            setPlaylist((prev) => [newMusic, ...prev]);
            setCurrentPlayingMusic(newMusic);
            setCurrentPlayingId(newMusic.id);
          } else if (status.stage === "failed") {
            clearInterval(interval);
            setIsBlendGenerating(false);
          }
        } catch { /* keep polling */ }
      }, 2000);
      setTimeout(() => clearInterval(interval), 300000);
    } catch {
      setIsBlendGenerating(false);
    }
  }, [blendMusicGenModel]);

  // ---- Batch generation ----
  const handleBatchGenerate = useCallback(async (prompts: string[], models: string[]) => {
    if (!selectedStyle) return;
    setIsBatchGenerating(true);
    setBatchCells([]);
    try {
      const { batch_id, tasks } = await apiBatchGenerate(Number(selectedStyle.id), prompts, models);
      setBatchCells(tasks.map((t) => ({ ...t, status: "pending" })));

      const interval = setInterval(async () => {
        try {
          const batchStatus = await pollBatchStatus(batch_id);
          setBatchCells(batchStatus.cells.map((c: {
            task_id: string; prompt: string; model: string; status: string; music_id?: number; file_path?: string;
          }) => ({
            task_id: c.task_id,
            prompt: c.prompt,
            model: c.model,
            status: c.status,
            file_path: c.file_path,
          })));
          const done = batchStatus.completed +
            batchStatus.cells.filter((c: { status: string }) => c.status === "failed").length;
          if (done >= batchStatus.total) {
            clearInterval(interval);
            setIsBatchGenerating(false);
            for (const cell of batchStatus.cells) {
              if (cell.status === "completed" && cell.music_id) {
                setPlaylist((prev) => {
                  if (prev.some((m) => m.id === String(cell.music_id))) return prev;
                  return [{
                    id: String(cell.music_id),
                    title: cell.prompt.slice(0, 30),
                    prompt: cell.prompt,
                    styleName: selectedStyle.name,
                    filePath: cell.file_path || "",
                    duration: 0,
                    musicGenModel: cell.model,
                    createdAt: new Date().toISOString().split("T")[0],
                  }, ...prev];
                });
              }
            }
          }
        } catch { /* keep polling */ }
      }, 3000);
      setTimeout(() => clearInterval(interval), 600000);
    } catch {
      setIsBatchGenerating(false);
    }
  }, [selectedStyle]);

  // Restore saved preferences from localStorage after hydration
  useEffect(() => {
    const tier = localStorage.getItem("sonicai_tier") as HardwareTier | null;
    if (tier) setHardwareTier(tier);
    const pref = localStorage.getItem("sonicai_preference") as PreferenceMode | null;
    if (pref) setPreference(pref);
    const vs = localStorage.getItem("sonicai_vocal_sep");
    if (vs) setVocalSepModel(vs);
    const se = localStorage.getItem("sonicai_style_extract");
    if (se) setStyleExtractModel(se);
    const mg = localStorage.getItem("sonicai_music_gen");
    if (mg) setMusicGenModel(mg);
  }, []);

  // Fetch voice models when switching to voice tab
  useEffect(() => {
    if (activeTab !== "voice") return;
    let cancelled = false;
    apiGetVoiceModels().then((models) => {
      if (!cancelled) setVoiceModels(models);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeTab]);

  // Poll training voice models
  useEffect(() => {
    const trainingModels = voiceModels.filter((m) => m.status === "training" || m.status === "preprocessing");
    if (trainingModels.length === 0) return;

    const interval = setInterval(async () => {
      const updated = await Promise.all(
        trainingModels.map(async (m) => {
          try {
            const status = await apiPollVoiceStatus(m.id);
            return { ...m, status: status.status as VoiceModel["status"], epoch: status.current_epoch, qualityTier: (status.available_tiers[status.available_tiers.length - 1] || m.qualityTier) as VoiceModel["qualityTier"] };
          } catch { return m; }
        })
      );
      setVoiceModels((prev) =>
        prev.map((m) => updated.find((u) => u.id === m.id) || m)
      );
      // Stop polling if all done
      if (updated.every((m) => m.status === "ready" || m.status === "failed")) {
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [voiceModels.filter((m) => m.status === "training" || m.status === "preprocessing").length]);

  const handleDeleteVoice = useCallback(async (id: string) => {
    setVoiceModels((prev) => prev.filter((m) => m.id !== id));
    if (selectedVoiceId === id) setSelectedVoiceId(undefined);
    await apiDeleteVoiceModel(id).catch(() => {});
  }, [selectedVoiceId]);

  const handleTrainVoice = useCallback(async (audioAssetId: number, name: string, qualityTarget: string) => {
    try {
      const { model_id } = await apiTrainVoice(audioAssetId, name, qualityTarget);
      // Add optimistic model
      const newModel: VoiceModel = {
        id: String(model_id),
        name,
        sourceAudioId: String(audioAssetId),
        status: "preprocessing",
        epoch: 0,
        qualityTier: "preview",
        durationSeconds: 0,
        createdAt: new Date().toISOString(),
      };
      setVoiceModels((prev) => [newModel, ...prev]);
    } catch { /* training trigger failed */ }
  }, []);

  const handleTrainVoiceClick = useCallback(async () => {
    if (!trainAssetId || !trainVoiceName.trim()) return;
    setIsTraining(true);
    try {
      await handleTrainVoice(Number(trainAssetId), trainVoiceName.trim(), trainQualityTarget);
      setTrainVoiceName("");
      setTrainAssetId("");
    } catch { /* handled in handleTrainVoice */ }
    setIsTraining(false);
  }, [trainAssetId, trainVoiceName, trainQualityTarget, handleTrainVoice]);

  const handleSingVoiceClick = useCallback(async () => {
    if (!selectedVoiceId || !singRefAssetId) return;
    setIsSinging(true);
    try {
      await apiSingVoice(selectedVoiceId, singRefAssetId);
      setSingRefAssetId("");
    } catch { /* silently fail */ }
    setIsSinging(false);
  }, [selectedVoiceId, singRefAssetId]);

  return (
    <div className="flex min-h-[100dvh]">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSettingsClick={() => setShowSettings(true)} />

      <main className="flex-1 ml-60 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          >
            <span className="eyebrow mb-2 inline-block">
              {activeTab === "studio" ? "STUDIO" : activeTab === "library" ? "LIBRARY" : activeTab === "blend" ? "BLEND" : activeTab === "batch" ? "BATCH" : activeTab === "voice" ? "VOICE" : "ARCHIVE"}
            </span>
            <h2 className="text-3xl italic font-medium mt-1 tracking-tight"
              style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
              {activeTab === "studio" ? "AI 音乐创作" : activeTab === "library" ? "风格标签管理" : activeTab === "blend" ? "风格融合生成" : activeTab === "batch" ? "批量矩阵生成" : activeTab === "voice" ? "声音模型管理" : "生成历史记录"}
            </h2>
            <div className="flex items-center gap-3 mt-3">
              <div className="w-8 h-px" style={{ background: "var(--accent)", opacity: 0.4 }} />
              <div className="w-1 h-1 rotate-45" style={{ background: "var(--accent)", opacity: 0.3 }} />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {activeTab === "studio" ? "上传音频 → 选择风格标签 → 输入描述 → 生成专属音乐" : activeTab === "library" ? "查看、选择或删除已提取的音乐风格特征向量" : activeTab === "blend" ? "选择 2-3 个风格标签，调节混合比例，融合生成全新音乐" : activeTab === "batch" ? "多个提示词 × 多个模型，一键生成对比矩阵" : activeTab === "voice" ? "上传歌曲训练专属声音模型，选择模型生成人声" : "播放和回顾所有已生成的 AI 音乐作品"}
              </p>
            </div>
          </motion.div>

          {/* Tab content */}
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === "studio" && (
              <motion.div key="studio" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }}>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                  <div className="lg:col-span-2 space-y-5">
                    <ErrorBoundary>
                      <Dropzone
                        onUpload={handleUpload}
                        assets={uploadingAssets}
                        vocalSepModel={vocalSepModel}
                        styleExtractModel={styleExtractModel}
                        onVocalSepModelChange={handleVocalSepModelChange}
                        onStyleExtractModelChange={handleStyleExtractModelChange}
                        vocalSepModels={DEFAULT_VOCAL_SEPARATION_MODELS}
                        styleExtractModels={DEFAULT_STYLE_EXTRACTION_MODELS}
                      />
                    </ErrorBoundary>
                    <ErrorBoundary>
                      <StyleLibrary
                        styles={styles}
                        selectedId={selectedStyle?.id}
                        onSelect={setSelectedStyle}
                        onDelete={(id) => {
                          setStyles((prev) => prev.filter((s) => s.id !== id));
                          if (selectedStyle?.id === id) setSelectedStyle(null);
                        }}
                      />
                    </ErrorBoundary>
                  </div>
                  <div className="lg:col-span-3 space-y-5">
                    <ErrorBoundary>
                      <GenerationConsole
                        hasStyle={!!selectedStyle}
                        styleName={selectedStyle?.name}
                        isGenerating={isGenerating}
                        onGenerate={handleGenerate}
                        musicGenModel={musicGenModel}
                        onMusicGenModelChange={handleMusicGenModelChange}
                        musicGenModels={DEFAULT_MUSIC_GENERATION_MODELS}
                      />
                    </ErrorBoundary>
                    {currentPlayingMusic && (
                      <ErrorBoundary>
                        <MusicPlayer
                          music={currentPlayingMusic}
                          hasPrev={currentIndex < playlist.length - 1}
                          hasNext={currentIndex > 0}
                          onPrev={handlePrev}
                          onNext={handleNext}
                        />
                      </ErrorBoundary>
                    )}
                    <ErrorBoundary>
                      <Playlist items={playlist} currentPlayingId={currentPlayingId} onPlay={handlePlay} />
                    </ErrorBoundary>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "library" && (
              <motion.div key="library" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="max-w-2xl">
                <StyleLibrary
                  styles={styles}
                  selectedId={selectedStyle?.id}
                  onSelect={setSelectedStyle}
                  onDelete={(id) => {
                    setStyles((prev) => prev.filter((s) => s.id !== id));
                    if (selectedStyle?.id === id) setSelectedStyle(null);
                  }}
                />
              </motion.div>
            )}

            {activeTab === "blend" && (
              <motion.div key="blend" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="max-w-2xl space-y-5">
                <ErrorBoundary>
                  <BlendPanel
                    styles={styles}
                    musicGenModel={blendMusicGenModel}
                    onMusicGenModelChange={setBlendMusicGenModel}
                    musicGenModels={DEFAULT_MUSIC_GENERATION_MODELS}
                    onGenerate={handleBlendGenerate}
                    isGenerating={isBlendGenerating}
                  />
                </ErrorBoundary>
                {currentPlayingMusic && (
                  <ErrorBoundary>
                    <MusicPlayer
                      music={currentPlayingMusic}
                      hasPrev={currentIndex < playlist.length - 1}
                      hasNext={currentIndex > 0}
                      onPrev={handlePrev}
                      onNext={handleNext}
                    />
                  </ErrorBoundary>
                )}
              </motion.div>
            )}

            {activeTab === "batch" && (
              <motion.div key="batch" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="max-w-4xl space-y-5">
                <ErrorBoundary>
                  <BatchConsole
                    musicGenModels={DEFAULT_MUSIC_GENERATION_MODELS}
                    onGenerate={handleBatchGenerate}
                    isGenerating={isBatchGenerating}
                    cells={batchCells}
                    currentPlayingCell={batchPlayingCell}
                    onPlayCell={(taskId, filePath) => {
                      if (batchPlayingCell === taskId) {
                        setBatchPlayingCell(null);
                        setCurrentPlayingMusic(null);
                        setCurrentPlayingId(null);
                        return;
                      }
                      setBatchPlayingCell(taskId);
                      const cell = batchCells.find((c) => c.task_id === taskId);
                      setCurrentPlayingMusic({
                        id: taskId,
                        title: cell?.prompt.slice(0, 30) || "Batch",
                        prompt: cell?.prompt || "",
                        styleName: selectedStyle?.name || "Batch",
                        filePath,
                        duration: 0,
                        musicGenModel: cell?.model,
                        createdAt: new Date().toISOString().split("T")[0],
                      });
                      setCurrentPlayingId(taskId);
                    }}
                  />
                </ErrorBoundary>
                {currentPlayingMusic && batchPlayingCell && (
                  <ErrorBoundary>
                    <MusicPlayer music={currentPlayingMusic} />
                  </ErrorBoundary>
                )}
              </motion.div>
            )}

            {activeTab === "voice" && (
              <motion.div key="voice" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="max-w-2xl space-y-5">
                {/* Train New Voice */}
                <div className="card-outer">
                  <div className="card-inner p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="eyebrow">训练</span>
                      <h3 className="text-lg italic font-medium" style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
                        训练新声音
                      </h3>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>源音频</p>
                        <select
                          className="settings-select"
                          value={trainAssetId}
                          onChange={(e) => setTrainAssetId(e.target.value)}
                          style={{ padding: "8px 36px 8px 12px", fontSize: "0.8125rem" }}
                        >
                          <option value="">选择已处理完成的音频...</option>
                          {uploadingAssets.filter(a => a.status === "completed").map((a) => (
                            <option key={a.id} value={a.id}>{a.fileName}</option>
                          ))}
                        </select>
                        {uploadingAssets.filter(a => a.status === "completed").length === 0 && (
                          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                            请先在创作工作室上传并处理音频
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>模型名称</p>
                        <input
                          type="text"
                          placeholder="例如：我的歌声"
                          value={trainVoiceName}
                          onChange={(e) => setTrainVoiceName(e.target.value)}
                          className="w-full px-4 py-2 rounded-xl text-sm"
                          style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)", outline: "none", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                        />
                      </div>
                      <div>
                        <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>品质目标</p>
                        <div className="flex gap-2">
                          {[
                            { key: "preview", label: "预览 (20 epochs)", desc: "~2分钟" },
                            { key: "standard", label: "标准 (100 epochs)", desc: "~10分钟" },
                            { key: "premium", label: "高品质 (200 epochs)", desc: "~20分钟" },
                          ].map(({ key, label, desc }) => (
                            <button
                              key={key}
                              onClick={() => setTrainQualityTarget(key)}
                              className="flex-1 px-3 py-2.5 rounded-xl text-xs text-center transition-all duration-200"
                              style={{
                                background: trainQualityTarget === key ? "var(--accent-soft)" : "var(--bg-primary)",
                                border: trainQualityTarget === key ? "1px solid var(--accent)" : "1px solid var(--border-color)",
                                color: trainQualityTarget === key ? "var(--accent)" : "var(--text-secondary)",
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                cursor: "pointer",
                              }}
                            >
                              <div className="font-medium">{label}</div>
                              <div className="text-[10px] mt-0.5 opacity-60">{desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        className="btn-primary w-full"
                        disabled={!trainAssetId || !trainVoiceName.trim() || isTraining}
                        onClick={handleTrainVoiceClick}
                      >
                        {isTraining ? "提交中..." : "开始训练"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Voice Model Library */}
                <VoiceModelLibrary
                  models={voiceModels}
                  selectedId={selectedVoiceId}
                  onSelect={(model) => setSelectedVoiceId(model.id)}
                  onDelete={handleDeleteVoice}
                />

                {/* Sing with selected voice */}
                {selectedVoiceId && voiceModels.find(m => m.id === selectedVoiceId && m.status === "ready") && (
                  <div className="card-outer">
                    <div className="card-inner p-6 space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="eyebrow">生成</span>
                        <h3 className="text-lg italic font-medium" style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
                          使用已选声音生成
                        </h3>
                      </div>
                      <div>
                        <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>参考音频</p>
                        <select
                          className="settings-select"
                          value={singRefAssetId}
                          onChange={(e) => setSingRefAssetId(e.target.value)}
                          style={{ padding: "8px 36px 8px 12px", fontSize: "0.8125rem" }}
                        >
                          <option value="">选择参考音频...</option>
                          {uploadingAssets.filter(a => a.status === "completed").map((a) => (
                            <option key={a.id} value={a.id}>{a.fileName}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        className="btn-primary w-full"
                        disabled={!singRefAssetId || isSinging}
                        onClick={handleSingVoiceClick}
                      >
                        {isSinging ? "生成中..." : "生成人声"}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "history" && (
              <motion.div key="history" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="max-w-3xl space-y-5">
                <Playlist items={playlist} currentPlayingId={currentPlayingId} onPlay={handlePlay} />
                {currentPlayingMusic && (
                  <MusicPlayer
                    music={currentPlayingMusic}
                    hasPrev={currentIndex < playlist.length - 1}
                    hasNext={currentIndex > 0}
                    onPrev={handlePrev}
                    onNext={handleNext}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

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
    </div>
  );
}
