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
import SongCreator from "@/components/SongCreator";
import ErrorBoundary from "@/components/ErrorBoundary";
import SettingsPanel from "@/components/SettingsPanel";
import { getTierConfig } from "@/lib/hardware-tiers";
import { useModelCatalog } from "@/lib/use-model-catalog";
import type { AudioAsset, StyleTag, GeneratedMusic, VoiceModel, HardwareTier, PreferenceMode, ProcessingMode, Song } from "@/types";
import { API_BASE, authHeaders, getToken } from "@/lib/auth";

async function uploadAudio(
  file: File,
  vocalSepModel: string,
  styleExtractModel: string,
  processingMode: ProcessingMode = "sync",
): Promise<{ asset_id: number; task_id: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("vocal_sep_model", vocalSepModel);
  formData.append("style_extract_model", styleExtractModel);
  const res = await fetch(`${API_BASE}/audio/upload?processing_mode=${processingMode}`, {
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
  processingMode: ProcessingMode = "sync",
): Promise<{ task_id: string }> {
  const res = await fetch(`${API_BASE}/music/generate?processing_mode=${processingMode}`, {
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
  processingMode: ProcessingMode = "sync",
): Promise<{ task_id: string }> {
  const res = await fetch(`${API_BASE}/music/blend-generate?processing_mode=${processingMode}`, {
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
  processingMode: ProcessingMode = "sync",
): Promise<{ batch_id: string; tasks: { task_id: string; prompt: string; model: string }[] }> {
  const res = await fetch(`${API_BASE}/music/generate-batch?processing_mode=${processingMode}`, {
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
  interface VoiceModelItem {
    id: number; name: string; source_audio_ids: string; status: string;
    epoch: number; quality_tier: string; duration_seconds: number; created_at: string;
  }
  return (data.items || []).map((item: VoiceModelItem) => ({
    id: String(item.id),
    name: item.name,
    sourceAudioIds: (() => { try { return JSON.parse(item.source_audio_ids || "[]"); } catch { return []; } })(),
    status: item.status,
    epoch: item.epoch || 0,
    qualityTier: item.quality_tier || "preview",
    durationSeconds: item.duration_seconds || 0,
    createdAt: item.created_at || "",
  }));
}

async function apiTrainVoice(audioAssetIds: number[], name: string, qualityTarget: string): Promise<{ model_id: number }> {
  const res = await fetch(`${API_BASE}/voice/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ audio_asset_ids: audioAssetIds, name, quality_target: qualityTarget }),
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

async function apiDeleteAudioAsset(assetId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/audio/${assetId}`, {
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

async function apiSingVoice(voiceModelId: string, referenceAudioId: string, processingMode: ProcessingMode = "auto"): Promise<{ generation_id: number; status?: string }> {
  const res = await fetch(`${API_BASE}/voice/sing?processing_mode=${processingMode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ voice_model_id: Number(voiceModelId), reference_audio_id: Number(referenceAudioId) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "人声生成请求失败" }));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json();
}

async function apiPollVocalGeneration(generationId: number): Promise<VocalGeneration> {
  const res = await fetch(`${API_BASE}/voice/generations/${generationId}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error("Status check failed");
  const data = await res.json();
  return {
    id: String(data.id),
    voiceModelId: String(data.voice_model_id),
    outputPath: data.output_path || "",
    status: data.status,
    durationSeconds: data.duration_seconds || 0,
    createdAt: data.created_at || "",
  };
}

async function apiFetchSuggestions(styleVectorId: number): Promise<string[]> {
  const res = await fetch(`${API_BASE}/music/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ style_vector_id: styleVectorId }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.suggestions || [];
}

async function apiGetAudioAssets(): Promise<{ items: { id: number; file_name: string; file_path: string; status: string; vocal_sep_model?: string; style_vector?: { id: number; style_name: string; asset_id: number; style_extract_model: string; created_at: string } | null; created_at?: string }[]; total: number }> {
  const res = await fetch(`${API_BASE}/audio/list`, { headers: await authHeaders() });
  if (!res.ok) return { items: [], total: 0 };
  return res.json();
}

async function apiGetMusicList(): Promise<{ items: { id: number; title: string; prompt: string; style_name: string; file_path: string; duration_seconds: number; music_gen_model?: string; created_at: string }[]; total: number }> {
  const res = await fetch(`${API_BASE}/music/list`, { headers: await authHeaders() });
  if (!res.ok) return { items: [], total: 0 };
  return res.json();
}

export default function CreatePage() {
  const { catalog: modelCatalog } = useModelCatalog();

  const vocalSepModels = modelCatalog.vocal_separation;
  const styleExtractModels = modelCatalog.style_extraction;
  const musicGenModels = modelCatalog.music_generation;

  const [activeTab, setActiveTab] = useState("studio");
  const [uploadingAssets, setUploadingAssets] = useState<AudioAsset[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<StyleTag | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([
    "一首适合深夜开车的 Lo-Fi 音乐",
    "带有爵士钢琴元素的氛围电子乐",
    "节奏轻快的夏日流行音乐",
    "适合冥想的大自然白噪音",
  ]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [voiceModels, setVoiceModels] = useState<VoiceModel[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | undefined>(undefined);
  const [trainVoiceName, setTrainVoiceName] = useState("");
  const [trainQualityTarget, setTrainQualityTarget] = useState("premium");
  const [trainAssetIds, setTrainAssetIds] = useState<number[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [singRefAssetId, setSingRefAssetId] = useState("");
  const [isSinging, setIsSinging] = useState(false);
  const [singError, setSingError] = useState<string | null>(null);
  const [vocalGenerations, setVocalGenerations] = useState<VocalGeneration[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);

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
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("sync");

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

  const handleProcessingModeChange = (mode: ProcessingMode) => {
    setProcessingMode(mode);
    localStorage.setItem("sonicai_processing_mode", mode);
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
      const { asset_id, task_id } = await uploadAudio(file, vocalSepModel, styleExtractModel, processingMode);
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
  }, [vocalSepModel, styleExtractModel, processingMode]);

  const handleGenerate = useCallback(async (prompt: string) => {
    if (!selectedStyle) return;
    setIsGenerating(true);
    try {
      const { task_id } = await apiGenerateMusic(Number(selectedStyle.id), prompt, musicGenModel, processingMode);
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
  }, [selectedStyle, musicGenModel, processingMode]);

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
      const { task_id } = await apiBlendGenerate(blends, prompt, blendMusicGenModel, processingMode);
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
  }, [blendMusicGenModel, processingMode]);

  // ---- Batch generation ----
  const handleBatchGenerate = useCallback(async (prompts: string[], models: string[]) => {
    if (!selectedStyle) return;
    setIsBatchGenerating(true);
    setBatchCells([]);
    try {
      const { batch_id, tasks } = await apiBatchGenerate(Number(selectedStyle.id), prompts, models, processingMode);
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
  }, [selectedStyle, processingMode]);

  // Load existing data from backend on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [assetsData, musicData] = await Promise.all([
          apiGetAudioAssets(),
          apiGetMusicList(),
        ]);
        if (cancelled) return;

        // Load audio assets + style vectors
        const loadedAssets: AudioAsset[] = assetsData.items.map((a) => ({
          id: String(a.id),
          fileName: a.file_name,
          filePath: a.file_path,
          status: a.status as "processing" | "completed" | "failed",
          vocalSepModel: a.vocal_sep_model,
          uploadedAt: a.created_at || "",
        }));
        setUploadingAssets(loadedAssets);

        // Load style vectors
        const loadedStyles: StyleTag[] = [];
        for (const a of assetsData.items) {
          if (a.style_vector) {
            loadedStyles.push({
              id: String(a.style_vector.id),
              name: a.style_vector.style_name,
              assetId: String(a.style_vector.asset_id),
              embedding: [],
              styleExtractModel: a.style_vector.style_extract_model,
              createdAt: a.style_vector.created_at?.split("T")[0] || "",
            });
          }
        }
        setStyles(loadedStyles);

        // Load music playlist
        const loadedPlaylist: GeneratedMusic[] = musicData.items.map((m) => ({
          id: String(m.id),
          title: m.title,
          prompt: m.prompt,
          styleName: m.style_name,
          filePath: m.file_path,
          duration: m.duration_seconds,
          musicGenModel: m.music_gen_model,
          providerMode: (m as any).provider_mode || "mock",
          createdAt: m.created_at?.split("T")[0] || "",
        }));
        setPlaylist(loadedPlaylist);
      } catch { /* silently ignore on first load */ }
    })();
    return () => { cancelled = true; };
  }, []);

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
    const pm = localStorage.getItem("sonicai_processing_mode") as ProcessingMode | null;
    if (pm) setProcessingMode(pm);
  }, []);

  // Fetch suggestions when style changes
  useEffect(() => {
    if (!selectedStyle?.id) return;
    let cancelled = false;
    setSuggestionsLoading(true);
    apiFetchSuggestions(Number(selectedStyle.id))
      .then((items) => {
        if (!cancelled && items.length > 0) setSuggestions(items);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSuggestionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedStyle?.id]);

  // Fetch voice models when switching to voice or song tab
  useEffect(() => {
    if (activeTab !== "voice" && activeTab !== "song") return;
    let cancelled = false;
    apiGetVoiceModels().then((models) => {
      if (!cancelled) setVoiceModels(models);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeTab]);

  // Fetch songs when switching to song or history tab
  useEffect(() => {
    if (activeTab !== "song" && activeTab !== "history") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/song/list`, { headers: await authHeaders() });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && data.items) {
          setSongs(data.items.map((item: any) => ({
            id: String(item.id),
            theme: item.theme || "",
            status: item.status,
            lyrics: item.lyrics || "",
            instrumentalPath: item.instrumental_path || "",
            vocalPath: item.vocal_path || "",
            mixedPath: item.mixed_path || "",
            createdAt: item.created_at || "",
            errorMessage: item.error_message || "",
            lyricsProvider: item.lyrics_provider || "",
            instrumentalProvider: item.instrumental_provider || "",
            vocalProvider: item.vocal_provider || "",
            hasVocals: item.has_vocals ?? false,
          })));
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [activeTab]);

  // Poll training voice models
  useEffect(() => {
    const trainingIds = voiceModels
      .filter((m) => m.status === "training" || m.status === "preprocessing")
      .map((m) => m.id);
    if (trainingIds.length === 0) return;

    let active = true;
    const interval = setInterval(async () => {
      if (!active) return;
      const updated = await Promise.all(
        trainingIds.map(async (id) => {
          try {
            const status = await apiPollVoiceStatus(id);
            return { id, status: status.status as VoiceModel["status"], epoch: status.current_epoch, qualityTier: (status.available_tiers[status.available_tiers.length - 1] || "preview") as VoiceModel["qualityTier"] };
          } catch { return { id, status: "training" as const, epoch: 0, qualityTier: "preview" as const }; }
        })
      );
      if (!active) return;
      setVoiceModels((prev) =>
        prev.map((m) => {
          const u = updated.find((x) => x.id === m.id);
          return u && u.status !== "training" ? { ...m, status: u.status, epoch: u.epoch, qualityTier: u.qualityTier } : m;
        })
      );
      if (updated.every((x) => x.status === "ready" || x.status === "failed")) {
        clearInterval(interval);
      }
    }, 3000);
    return () => { active = false; clearInterval(interval); };
  }, [voiceModels]);

  // Poll in-progress vocal generations
  useEffect(() => {
    const inProgressIds = vocalGenerations
      .filter((g) => g.status === "pending" || g.status === "processing")
      .map((g) => g.id);
    if (inProgressIds.length === 0) return;

    let active = true;
    const interval = setInterval(async () => {
      if (!active) return;
      const updated = await Promise.all(
        inProgressIds.map(async (id) => {
          try {
            return await apiPollVocalGeneration(Number(id));
          } catch {
            return null;
          }
        })
      );
      if (!active) return;
      setVocalGenerations((prev) =>
        prev.map((g) => {
          const u = updated.find((x) => x?.id === g.id);
          return u || g;
        })
      );
      if (updated.every((x) => !x || x.status === "completed" || x.status === "failed")) {
        clearInterval(interval);
      }
    }, 3000);
    return () => { active = false; clearInterval(interval); };
  }, [vocalGenerations]);

  const handleDeleteVoice = useCallback(async (id: string) => {
    setVoiceModels((prev) => prev.filter((m) => m.id !== id));
    if (selectedVoiceId === id) setSelectedVoiceId(undefined);
    await apiDeleteVoiceModel(id).catch(() => {});
  }, [selectedVoiceId]);

  const handleTrainVoice = useCallback(async (audioAssetIds: number[], name: string, qualityTarget: string) => {
    try {
      const { model_id } = await apiTrainVoice(audioAssetIds, name, qualityTarget);
      const newModel: VoiceModel = {
        id: String(model_id),
        name,
        sourceAudioIds: audioAssetIds,
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
    if (trainAssetIds.length === 0 || !trainVoiceName.trim()) return;
    setIsTraining(true);
    try {
      await handleTrainVoice(trainAssetIds, trainVoiceName.trim(), trainQualityTarget);
      setTrainVoiceName("");
      setTrainAssetIds([]);
    } catch { /* handled in handleTrainVoice */ }
    setIsTraining(false);
  }, [trainAssetIds, trainVoiceName, trainQualityTarget, handleTrainVoice]);

  const handleSingVoiceClick = useCallback(async () => {
    if (!selectedVoiceId || !singRefAssetId) return;
    setIsSinging(true);
    setSingError(null);
    try {
      const { generation_id, status: immediateStatus } = await apiSingVoice(selectedVoiceId, singRefAssetId, processingMode);
      setSingRefAssetId("");

      const newGen: VocalGeneration = {
        id: String(generation_id),
        voiceModelId: selectedVoiceId,
        outputPath: "",
        status: immediateStatus === "completed" ? "completed" : immediateStatus === "processing" ? "processing" : "pending",
        durationSeconds: 0,
        createdAt: new Date().toISOString(),
      };
      setVocalGenerations((prev) => [newGen, ...prev]);

      if (immediateStatus === "completed") {
        setIsSinging(false);
        return;
      }

      // Poll for completion
      const interval = setInterval(async () => {
        try {
          const status = await apiPollVocalGeneration(generation_id);
          setVocalGenerations((prev) =>
            prev.map((g) => (g.id === String(generation_id) ? status : g))
          );
          if (status.status === "completed" || status.status === "failed") {
            clearInterval(interval);
            setIsSinging(false);
            if (status.status === "failed") {
              setSingError("人声生成失败，请检查声音模型和参考音频");
            }
          }
        } catch {
          // Keep polling
        }
      }, 2000);
      setTimeout(() => {
        clearInterval(interval);
        setIsSinging(false);
      }, 300000);
    } catch (e: any) {
      setSingError(e.message || "人声生成失败");
      setIsSinging(false);
    }
  }, [selectedVoiceId, singRefAssetId, processingMode]);

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
              {activeTab === "studio" ? "STUDIO" : activeTab === "library" ? "LIBRARY" : activeTab === "blend" ? "BLEND" : activeTab === "batch" ? "BATCH" : activeTab === "voice" ? "VOICE" : activeTab === "song" ? "SONG" : "ARCHIVE"}
            </span>
            <h2 className="text-3xl italic font-medium mt-1 tracking-tight"
              style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
              {activeTab === "studio" ? "AI 音乐创作" : activeTab === "library" ? "风格标签管理" : activeTab === "blend" ? "风格融合生成" : activeTab === "batch" ? "批量矩阵生成" : activeTab === "voice" ? "声音模型管理" : activeTab === "song" ? "AI 歌曲创作" : "生成历史记录"}
            </h2>
            <div className="flex items-center gap-3 mt-3">
              <div className="w-8 h-px" style={{ background: "var(--accent)", opacity: 0.4 }} />
              <div className="w-1 h-1 rotate-45" style={{ background: "var(--accent)", opacity: 0.3 }} />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {activeTab === "studio" ? "上传音频 → 选择风格标签 → 输入描述 → 生成专属音乐" : activeTab === "library" ? "查看、选择或删除已提取的音乐风格特征向量" : activeTab === "blend" ? "选择 2-3 个风格标签，调节混合比例，融合生成全新音乐" : activeTab === "batch" ? "多个提示词 × 多个模型，一键生成对比矩阵" : activeTab === "voice" ? "上传歌曲训练专属声音模型，选择模型生成人声" : activeTab === "song" ? "输入主题 → AI 自动写词、编曲、人声、混音 → 完整歌曲" : "播放和回顾所有已生成的 AI 音乐作品"}
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
                        vocalSepModels={vocalSepModels}
                        styleExtractModels={styleExtractModels}
                      />
                    </ErrorBoundary>
                    <ErrorBoundary>
                      <StyleLibrary
                        styles={styles}
                        selectedId={selectedStyle?.id}
                        onSelect={setSelectedStyle}
                        onDelete={async (styleId) => {
                          const style = styles.find((s) => s.id === styleId);
                          if (style) await apiDeleteAudioAsset(style.assetId);
                          // Reload from backend to ensure consistency
                          const data = await apiGetAudioAssets();
                          setUploadingAssets(data.items.map((a) => ({
                            id: String(a.id), fileName: a.file_name, filePath: a.file_path,
                            status: a.status as "processing" | "completed" | "failed",
                            vocalSepModel: a.vocal_sep_model, uploadedAt: a.created_at || "",
                          })));
                          const freshStyles: StyleTag[] = [];
                          for (const a of data.items) {
                            if (a.style_vector) {
                              freshStyles.push({
                                id: String(a.style_vector.id), name: a.style_vector.style_name,
                                assetId: String(a.style_vector.asset_id), embedding: [],
                                styleExtractModel: a.style_vector.style_extract_model,
                                createdAt: a.style_vector.created_at?.split("T")[0] || "",
                              });
                            }
                          }
                          setStyles(freshStyles);
                          if (selectedStyle?.id === styleId) setSelectedStyle(null);
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
                        musicGenModels={musicGenModels}
                        suggestions={suggestions}
                        suggestionsLoading={suggestionsLoading}
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
                  onDelete={async (styleId) => {
                    const style = styles.find((s) => s.id === styleId);
                    if (style) await apiDeleteAudioAsset(style.assetId);
                    const data = await apiGetAudioAssets();
                    setUploadingAssets(data.items.map((a) => ({
                      id: String(a.id), fileName: a.file_name, filePath: a.file_path,
                      status: a.status as "processing" | "completed" | "failed",
                      vocalSepModel: a.vocal_sep_model, uploadedAt: a.created_at || "",
                    })));
                    const freshStyles: StyleTag[] = [];
                    for (const a of data.items) {
                      if (a.style_vector) {
                        freshStyles.push({
                          id: String(a.style_vector.id), name: a.style_vector.style_name,
                          assetId: String(a.style_vector.asset_id), embedding: [],
                          styleExtractModel: a.style_vector.style_extract_model,
                          createdAt: a.style_vector.created_at?.split("T")[0] || "",
                        });
                      }
                    }
                    setStyles(freshStyles);
                    if (selectedStyle?.id === styleId) setSelectedStyle(null);
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
                    musicGenModels={musicGenModels}
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
                    musicGenModels={musicGenModels}
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
                        <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
                          源音频 ({trainAssetIds.length} 首已选)
                        </p>
                        {uploadingAssets.filter(a => a.status === "completed").length === 0 ? (
                          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                            请先在创作工作室上传并处理音频
                          </p>
                        ) : (
                          <div className="space-y-1 max-h-40 overflow-y-auto" style={{ background: "var(--bg-primary)", borderRadius: "12px", padding: "8px", border: "1px solid var(--border-color)" }}>
                            {uploadingAssets.filter(a => a.status === "completed").map((a) => {
                              const checked = trainAssetIds.includes(Number(a.id));
                              return (
                                <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors"
                                  style={{ background: checked ? "var(--accent-soft)" : "transparent" }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const id = Number(a.id);
                                      setTrainAssetIds(prev =>
                                        checked ? prev.filter(x => x !== id) : [...prev, id]
                                      );
                                    }}
                                    style={{ accentColor: "var(--accent)" }}
                                  />
                                  <span className="text-xs" style={{ color: "var(--text-primary)" }}>{a.fileName}</span>
                                </label>
                              );
                            })}
                          </div>
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
                        disabled={trainAssetIds.length === 0 || !trainVoiceName.trim() || isTraining}
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
                      {singError && (
                        <p className="text-xs" style={{ color: "#ef4444" }}>{singError}</p>
                      )}
                      {!singError && processingMode === "async" && (
                        <p className="text-[10px] opacity-60" style={{ color: "var(--text-tertiary)" }}>
                          需要 Redis + Celery Worker 运行中
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Vocal Generation Results */}
                {vocalGenerations.length > 0 && (
                  <div className="card-outer">
                    <div className="card-inner p-6 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="eyebrow">结果</span>
                        <h3 className="text-lg italic font-medium" style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
                          人声生成记录
                        </h3>
                      </div>
                      {vocalGenerations.slice(0, 5).map((gen) => (
                        <div key={gen.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border-color)" }}>
                          <div className="flex items-center gap-3">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{
                                background: gen.status === "completed" ? "#22c55e" : gen.status === "failed" ? "#ef4444" : gen.status === "processing" ? "#e8a840" : "#666",
                              }}
                            />
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
                            <audio
                              controls
                              className="h-7"
                              src={`${API_BASE}/voice/generations/${gen.id}/download`}
                              style={{ maxWidth: "200px" }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "song" && (
              <motion.div key="song" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="max-w-2xl">
                <SongCreator
                  voiceModels={voiceModels}
                  styles={styles}
                  selectedStyle={selectedStyle}
                  onStyleSelect={setSelectedStyle}
                  playlist={playlist}
                  onSongCreated={(song) => setSongs((prev) => [song, ...prev])}
                />
              </motion.div>
            )}

            {activeTab === "history" && (
              <motion.div key="history" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="max-w-3xl space-y-5">
                {songs.length > 0 && (
                  <div className="card-outer">
                    <div className="card-inner p-5 space-y-3">
                      <span className="eyebrow">歌曲历史</span>
                      {songs.slice(0, 10).map((song) => (
                        <div key={song.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border-color)" }}>
                          <div>
                            <p className="text-sm" style={{ color: "var(--text-primary)" }}>{song.theme}</p>
                            <p className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                              {song.status === "completed" ? (
                                <span style={{ color: "#22c55e" }}>
                                  {song.hasVocals ? "已合成人声" : "纯伴奏"}
                                </span>
                              ) : song.status === "failed" ? (
                                <span style={{ color: "#ef4444" }}>失败</span>
                              ) : (
                                <span>{song.status}</span>
                              )}
                              {" · "}{song.createdAt?.slice(0, 10)}
                            </p>
                          </div>
                          {song.status === "completed" && (
                            <audio controls className="h-7" src={`${API_BASE}/song/${song.id}/download`} style={{ maxWidth: "180px" }} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
        vocalSepModels={vocalSepModels}
        styleExtractModels={styleExtractModels}
        musicGenModels={musicGenModels}
        vocalSepModel={vocalSepModel}
        styleExtractModel={styleExtractModel}
        musicGenModel={musicGenModel}
        onVocalSepModelChange={handleVocalSepModelChange}
        onStyleExtractModelChange={handleStyleExtractModelChange}
        onMusicGenModelChange={handleMusicGenModelChange}
        processingMode={processingMode}
        onProcessingModeChange={handleProcessingModeChange}
      />
    </div>
  );
}
