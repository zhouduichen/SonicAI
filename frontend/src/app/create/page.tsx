"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import CreationWorkspace from "@/components/CreationWorkspace";
import AssetsWorkspace from "@/components/AssetsWorkspace";
import LabWorkspace from "@/components/LabWorkspace";
import ArchiveWorkspace from "@/components/ArchiveWorkspace";
import SettingsPanel from "@/components/SettingsPanel";
import TaskCenter from "@/components/TaskCenter";
import { getTierConfig } from "@/lib/hardware-tiers";
import { useModelCatalog } from "@/lib/use-model-catalog";
import * as api from "@/lib/api";
import { logError } from "@/lib/error-handler";
import type { GeneratedMusic, HardwareTier, PreferenceMode, ProcessingMode, Song } from "@/types";
import { useAudioAssets } from "@/lib/use-audio-assets";
import { useMusicGeneration } from "@/lib/use-music-generation";
import { useVoiceModels } from "@/lib/use-voice-models";
import { useSongs } from "@/lib/use-songs";

type Section = "create" | "assets" | "lab" | "archive";
type CreationMode = "quick" | "blend" | "song";

export default function CreatePage() {
  const { catalog: modelCatalog } = useModelCatalog();
  const vocalSepModels = modelCatalog.vocal_separation;
  const styleExtractModels = modelCatalog.style_extraction;
  const musicGenModels = modelCatalog.music_generation;

  // Section + creation mode
  const [activeSection, setActiveSection] = useState<Section>("create");
  const [creationMode, setCreationMode] = useState<CreationMode>("quick");

  // Audio assets + styles
  const {
    uploadingAssets, styles, selectedStyle, setSelectedStyle,
    handleUpload, handleDeleteStyle, setUploadingAssets,
  } = useAudioAssets();

  // Music generation
  const {
    playlist, setPlaylist, isGenerating, isBlendGenerating, isBatchGenerating,
    batchCells, handleGenerate, handleBlendGenerate, handleBatchGenerate, loadPlaylist,
  } = useMusicGeneration();

  // Voice models
  const {
    voiceModels, setVoiceModels, selectedVoiceId, setSelectedVoiceId,
    vocalGenerations, setVocalGenerations, isTraining, setIsTraining,
    isSinging, singError, handleDeleteVoice, handleTrainVoice, handleSingVoice,
  } = useVoiceModels(activeSection);

  // Songs
  const { songs, setSongs } = useSongs(activeSection);

  // Model selection — align defaults with mid-tier speed preset
  const midSpeed = getTierConfig("mid")!.presets.speed;
  const [vocalSepModel, setVocalSepModel] = useState(midSpeed.vocalSepModel);
  const [styleExtractModel, setStyleExtractModel] = useState(midSpeed.styleExtractModel);
  const [musicGenModel, setMusicGenModel] = useState(midSpeed.musicGenModel);
  const [blendMusicGenModel, setBlendMusicGenModel] = useState("musicgen_small");

  // Suggestions
  const [suggestions, setSuggestions] = useState<string[]>([
    "一首适合深夜开车的 Lo-Fi 音乐", "带有爵士钢琴元素的氛围电子乐",
    "节奏轻快的夏日流行音乐", "适合冥想的大自然白噪音",
  ]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Training UI state
  const [trainVoiceName, setTrainVoiceName] = useState("");
  const [trainQualityTarget, setTrainQualityTarget] = useState("premium");
  const [trainAssetIds, setTrainAssetIds] = useState<number[]>([]);
  const [singRefAssetId, setSingRefAssetId] = useState("");

  // Player state
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [currentPlayingMusic, setCurrentPlayingMusic] = useState<GeneratedMusic | null>(null);
  const [batchPlayingCell, setBatchPlayingCell] = useState<string | null>(null);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [hardwareTier, setHardwareTier] = useState<HardwareTier>("mid");
  const [preference, setPreference] = useState<PreferenceMode>("speed");
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("auto");

  // Player prev/next
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
  const handlePlay = useCallback((music: GeneratedMusic) => {
    setCurrentPlayingMusic(music);
    setCurrentPlayingId(music.id === currentPlayingId ? null : music.id);
  }, [currentPlayingId]);

  // Load existing playlist on mount
  useEffect(() => { loadPlaylist(); }, [loadPlaylist]);

  // Restore saved preferences
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

  // Fetch suggestions on style change
  useEffect(() => {
    if (!selectedStyle?.id) return;
    let cancelled = false;
    setSuggestionsLoading(true);
    import("@/lib/api").then(({ fetchSuggestions }) =>
      fetchSuggestions(Number(selectedStyle.id))
        .then((items) => { if (!cancelled && items.length > 0) setSuggestions(items); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setSuggestionsLoading(false); })
    );
    return () => { cancelled = true; };
  }, [selectedStyle?.id]);

  // ── Handlers ──

  const onUpload = useCallback((file: File) => handleUpload(file, vocalSepModel, styleExtractModel, processingMode),
    [handleUpload, vocalSepModel, styleExtractModel, processingMode]);

  const onDeleteAsset = useCallback(async (assetId: string) => {
    try {
      await api.deleteAudioAsset(assetId);
      setUploadingAssets((prev) => prev.filter((a) => a.id !== assetId));
    } catch (err) { logError("page:deleteAsset", err); }
  }, [setUploadingAssets]);

  const onGenerate = useCallback(async (prompt: string) => {
    if (!selectedStyle) return;
    await handleGenerate(selectedStyle, prompt, musicGenModel, processingMode);
  }, [selectedStyle, musicGenModel, processingMode, handleGenerate]);

  const onBlendGenerate = useCallback((blends: { style_vector_id: number; weight: number }[], prompt: string) => {
    return handleBlendGenerate(blends, prompt, blendMusicGenModel, processingMode);
  }, [blendMusicGenModel, processingMode, handleBlendGenerate]);

  const onBatchGenerate = useCallback((prompts: string[], models: string[]) => {
    if (!selectedStyle) return Promise.resolve();
    return handleBatchGenerate(selectedStyle, prompts, models, processingMode);
  }, [selectedStyle, processingMode, handleBatchGenerate]);

  const onBatchPlayCell = useCallback((taskId: string, filePath: string) => {
    if (batchPlayingCell === taskId) { setBatchPlayingCell(null); setCurrentPlayingMusic(null); setCurrentPlayingId(null); return; }
    setBatchPlayingCell(taskId);
    const cell = batchCells.find((c) => c.task_id === taskId);
    setCurrentPlayingMusic({
      id: taskId, title: cell?.prompt.slice(0, 30) || "Batch", prompt: cell?.prompt || "",
      styleName: selectedStyle?.name || "Batch", filePath, duration: 0,
      musicGenModel: cell?.model, createdAt: new Date().toISOString().split("T")[0],
    });
    setCurrentPlayingId(taskId);
  }, [batchPlayingCell, batchCells, selectedStyle]);

  const onTrainVoice = useCallback(async () => {
    if (trainAssetIds.length === 0 || !trainVoiceName.trim()) return;
    setIsTraining(true);
    try {
      await handleTrainVoice(trainAssetIds, trainVoiceName.trim(), trainQualityTarget);
      setTrainVoiceName("");
      setTrainAssetIds([]);
    } finally {
      setIsTraining(false);
    }
  }, [trainAssetIds, trainVoiceName, trainQualityTarget, handleTrainVoice, setIsTraining]);

  const onSingVoice = useCallback(async () => {
    if (!selectedVoiceId || !singRefAssetId) return;
    await handleSingVoice(selectedVoiceId, singRefAssetId, processingMode);
    setSingRefAssetId("");
  }, [selectedVoiceId, singRefAssetId, processingMode, handleSingVoice]);

  const onSongCreated = useCallback((song: Song) => {
    setSongs((prev) => [song, ...prev]);
  }, [setSongs]);

  const refreshSuggestions = useCallback(() => {
    if (!selectedStyle?.id) return;
    setSuggestionsLoading(true);
    import("@/lib/api").then(({ fetchSuggestions }) =>
      fetchSuggestions(Number(selectedStyle.id))
        .then((items) => { if (items.length > 0) setSuggestions(items); })
        .catch(() => {})
        .finally(() => setSuggestionsLoading(false))
    );
  }, [selectedStyle?.id]);

  // ── Settings handlers ──
  const setPrefAndPersist = (key: string, value: string) => { localStorage.setItem(key, value); };
  const handleTierChange = (tier: HardwareTier) => {
    setHardwareTier(tier); setPrefAndPersist("sonicai_tier", tier);
    const preset = getTierConfig(tier)?.presets[preference];
    if (preset) { setVocalSepModel(preset.vocalSepModel); setStyleExtractModel(preset.styleExtractModel); setMusicGenModel(preset.musicGenModel); setPrefAndPersist("sonicai_vocal_sep", preset.vocalSepModel); setPrefAndPersist("sonicai_style_extract", preset.styleExtractModel); setPrefAndPersist("sonicai_music_gen", preset.musicGenModel); }
  };
  const handlePreferenceChange = (mode: PreferenceMode) => {
    setPreference(mode); setPrefAndPersist("sonicai_preference", mode);
    const preset = getTierConfig(hardwareTier)?.presets[mode];
    if (preset) { setVocalSepModel(preset.vocalSepModel); setStyleExtractModel(preset.styleExtractModel); setMusicGenModel(preset.musicGenModel); setPrefAndPersist("sonicai_vocal_sep", preset.vocalSepModel); setPrefAndPersist("sonicai_style_extract", preset.styleExtractModel); setPrefAndPersist("sonicai_music_gen", preset.musicGenModel); }
  };

  return (
    <div className="flex min-h-[100dvh]">
      <Sidebar activeTab={activeSection} onTabChange={(tab) => setActiveSection(tab as Section)} onSettingsClick={() => setShowSettings(true)} />
      <main className="flex-1 ml-60 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Global task center */}
          <div className="flex items-center justify-end">
            <TaskCenter />
          </div>
          {activeSection === "create" && (
            <CreationWorkspace
              mode={creationMode}
              onModeChange={setCreationMode}
              styles={styles}
              selectedStyle={selectedStyle}
              onStyleSelect={setSelectedStyle}
              onGenerate={onGenerate}
              isGenerating={isGenerating}
              musicGenModel={musicGenModel}
              onMusicGenModelChange={(k) => { setMusicGenModel(k); setPrefAndPersist("sonicai_music_gen", k); }}
              musicGenModels={musicGenModels}
              suggestions={suggestions}
              suggestionsLoading={suggestionsLoading}
              onRefreshSuggestions={refreshSuggestions}
              onBlendGenerate={onBlendGenerate}
              isBlendGenerating={isBlendGenerating}
              blendMusicGenModel={blendMusicGenModel}
              onBlendMusicGenModelChange={setBlendMusicGenModel}
              voiceModels={voiceModels}
              songs={songs}
              processingMode={processingMode}
              onSongCreated={onSongCreated}
              playlist={playlist}
              currentPlayingMusic={currentPlayingMusic}
              currentPlayingId={currentPlayingId}
              onPlay={handlePlay}
              onPrev={handlePrev}
              onNext={handleNext}
              currentIndex={currentIndex}
              hardwareTier={hardwareTier}
              preference={preference}
              onPreferenceChange={handlePreferenceChange}
            />
          )}

          {activeSection === "assets" && (
            <AssetsWorkspace
              uploadingAssets={uploadingAssets}
              onUpload={onUpload}
              onDeleteAsset={onDeleteAsset}
              vocalSepModel={vocalSepModel}
              onVocalSepModelChange={(k) => { setVocalSepModel(k); setPrefAndPersist("sonicai_vocal_sep", k); }}
              vocalSepModels={vocalSepModels}
              styleExtractModel={styleExtractModel}
              onStyleExtractModelChange={(k) => { setStyleExtractModel(k); setPrefAndPersist("sonicai_style_extract", k); }}
              styleExtractModels={styleExtractModels}
              styles={styles}
              selectedStyle={selectedStyle}
              onStyleSelect={setSelectedStyle}
              onDeleteStyle={handleDeleteStyle}
              voiceModels={voiceModels}
              selectedVoiceId={selectedVoiceId}
              onVoiceSelect={setSelectedVoiceId}
              onDeleteVoice={handleDeleteVoice}
              trainVoiceName={trainVoiceName}
              setTrainVoiceName={setTrainVoiceName}
              trainQualityTarget={trainQualityTarget}
              setTrainQualityTarget={setTrainQualityTarget}
              trainAssetIds={trainAssetIds}
              setTrainAssetIds={setTrainAssetIds}
              onTrainVoice={onTrainVoice}
              isTraining={isTraining}
              singRefAssetId={singRefAssetId}
              setSingRefAssetId={setSingRefAssetId}
              onSingVoice={onSingVoice}
              isSinging={isSinging}
              singError={singError}
              vocalGenerations={vocalGenerations}
              processingMode={processingMode}
            />
          )}

          {activeSection === "lab" && (
            <LabWorkspace
              musicGenModels={musicGenModels}
              onBatchGenerate={onBatchGenerate}
              isBatchGenerating={isBatchGenerating}
              batchCells={batchCells}
              batchPlayingCell={batchPlayingCell}
              onBatchPlayCell={onBatchPlayCell}
              selectedStyle={selectedStyle}
              currentPlayingMusic={currentPlayingMusic}
              suggestions={suggestions}
            />
          )}

          {activeSection === "archive" && (
            <ArchiveWorkspace
              songs={songs}
              playlist={playlist}
              vocalGenerations={vocalGenerations}
              currentPlayingMusic={currentPlayingMusic}
              currentPlayingId={currentPlayingId}
              onPlay={handlePlay}
              onPrev={handlePrev}
              onNext={handleNext}
              currentIndex={currentIndex}
            />
          )}
        </div>
      </main>

      <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)}
        tier={hardwareTier} onTierChange={handleTierChange}
        preference={preference} onPreferenceChange={handlePreferenceChange}
        vocalSepModels={vocalSepModels} styleExtractModels={styleExtractModels} musicGenModels={musicGenModels}
        vocalSepModel={vocalSepModel} styleExtractModel={styleExtractModel} musicGenModel={musicGenModel}
        onVocalSepModelChange={setVocalSepModel}
        onStyleExtractModelChange={setStyleExtractModel}
        onMusicGenModelChange={setMusicGenModel}
        processingMode={processingMode}
        onProcessingModeChange={(m) => { setProcessingMode(m); setPrefAndPersist("sonicai_processing_mode", m); }} />
    </div>
  );
}
