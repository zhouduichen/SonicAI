"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import Dropzone from "@/components/Dropzone";
import StyleLibrary from "@/components/StyleLibrary";
import GenerationConsole from "@/components/GenerationConsole";
import MusicPlayer from "@/components/MusicPlayer";
import Playlist from "@/components/Playlist";
import VoiceModelLibrary from "@/components/VoiceModelLibrary";
import ErrorBoundary from "@/components/ErrorBoundary";
import type { AudioAsset, StyleTag, GeneratedMusic, TaskStatus, ModelCatalog, ModelSelection, VoiceModel } from "@/types";
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

async function uploadAudio(file: File, _vs?: string, _se?: string): Promise<AudioAsset> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/audio/upload`, {
    method: "POST",
    body: formData,
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

async function pollTaskStatus(taskId: string): Promise<TaskStatus> {
  const res = await fetch(`${API_BASE}/audio/status/${taskId}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Status check failed");
  return res.json();
}

async function apiGenerateMusic(vectorId: string, prompt: string, _model?: string): Promise<{ taskId: string }> {
  const res = await fetch(`${API_BASE}/music/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ style_vector_id: vectorId, text_prompt: prompt }),
  });
  if (!res.ok) throw new Error("Generation failed");
  return res.json();
}

export default function CreatePage() {
  const [activeTab, setActiveTab] = useState("studio");
  const [currentAsset, setCurrentAsset] = useState<AudioAsset | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<StyleTag | null>(null);
  const [voiceModels, setVoiceModels] = useState<VoiceModel[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | undefined>(undefined);

  const [styles, setStyles] = useState<StyleTag[]>([
    {
      id: "1",
      name: "我的魔幻电音_01",
      assetId: "a1",
      embedding: Array.from({ length: 512 }, () => Math.random()),
      createdAt: "2026-05-18",
    },
    {
      id: "2",
      name: "爵士钢琴氛围",
      assetId: "a2",
      embedding: Array.from({ length: 512 }, () => Math.random()),
      createdAt: "2026-05-17",
    },
  ]);

  const [playlist, setPlaylist] = useState<GeneratedMusic[]>([
    {
      id: "g1",
      title: "深夜 Lo-Fi 漫步",
      prompt: "一首适合深夜开车的 Lo-Fi 音乐",
      styleName: "我的魔幻电音_01",
      filePath: "/demo.wav",
      duration: 5,
      createdAt: "2026-05-19",
    },
    {
      id: "g2",
      title: "晨光氛围电子",
      prompt: "带有爵士钢琴元素的氛围电子乐",
      styleName: "爵士钢琴氛围",
      filePath: "/demo2.wav",
      duration: 6,
      createdAt: "2026-05-18",
    },
  ]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [currentPlayingMusic, setCurrentPlayingMusic] = useState<GeneratedMusic | null>(null);

  const handleUpload = useCallback(async (file: File) => {
    try {
      setCurrentAsset({
        id: Date.now().toString(),
        fileName: file.name,
        filePath: "",
        status: "processing",
        uploadedAt: new Date().toISOString(),
      });
      const asset = await uploadAudio(file);
      setCurrentAsset({ ...asset, status: "processing" });
      const interval = setInterval(async () => {
        try {
          const status = await pollTaskStatus(asset.id);
          if (status.stage === "completed") {
            clearInterval(interval);
            setCurrentAsset((prev) => prev ? { ...prev, status: "completed" } : null);
            const newStyle: StyleTag = {
              id: `s${Date.now()}`,
              name: `${file.name.replace(/\.[^.]+$/, "")}_风格`,
              assetId: asset.id,
              embedding: Array.from({ length: 512 }, () => Math.random()),
              createdAt: new Date().toISOString().split("T")[0],
            };
            setStyles((prev) => [...prev, newStyle]);
            setSelectedStyle(newStyle);
          } else if (status.stage === "failed") {
            clearInterval(interval);
            setCurrentAsset((prev) => prev ? { ...prev, status: "failed" } : null);
          }
        } catch { /* keep polling */ }
      }, 2000);
      setTimeout(() => clearInterval(interval), 120000);
    } catch {
      setCurrentAsset((prev) => prev ? { ...prev, status: "failed" } : null);
    }
  }, []);

  const handleGenerate = useCallback(async (prompt: string) => {
    if (!selectedStyle) return;
    setIsGenerating(true);
    try {
      const { taskId } = await apiGenerateMusic(selectedStyle.id, prompt);
      const interval = setInterval(async () => {
        try {
          const status = await pollTaskStatus(taskId);
          if (status.stage === "completed") {
            clearInterval(interval);
            setIsGenerating(false);
            const newMusic: GeneratedMusic = {
              id: `g${Date.now()}`,
              title: prompt.slice(0, 15),
              prompt,
              styleName: selectedStyle.name,
              filePath: "/demo.wav",
              duration: 5,
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
  }, [selectedStyle]);

  const handlePlay = useCallback((music: GeneratedMusic) => {
    setCurrentPlayingMusic(music);
    setCurrentPlayingId(music.id === currentPlayingId ? null : music.id);
  }, [currentPlayingId]);

  return (
    <div className="flex min-h-[100dvh]">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1 ml-60 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          >
            <span className="eyebrow mb-2 inline-block">
              {activeTab === "studio" ? "创作工作室" : activeTab === "library" ? "风格库" : activeTab === "voice" ? "声音模型库" : "生成记录"}
            </span>
            <h2 className="text-3xl italic font-medium mt-1 tracking-tight"
              style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
              {activeTab === "studio" ? "AI 音乐创作" : activeTab === "library" ? "风格标签管理" : activeTab === "voice" ? "声音模型管理" : "生成历史记录"}
            </h2>
            <div className="flex items-center gap-3 mt-3">
              <div className="w-8 h-px" style={{ background: "var(--accent)", opacity: 0.4 }} />
              <div className="w-1 h-1 rotate-45" style={{ background: "var(--accent)", opacity: 0.3 }} />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {activeTab === "studio" ? "上传音频 → 选择风格标签 → 输入描述 → 生成专属音乐" : activeTab === "library" ? "查看、选择或删除已提取的音乐风格特征向量" : activeTab === "voice" ? "上传歌曲训练专属声音模型，选择模型生成人声" : "播放和回顾所有已生成的 AI 音乐作品"}
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
                        asset={currentAsset}
                        vocalSepModel="demucs_htdemucs"
                        styleExtractModel="clap_laion"
                        onVocalSepModelChange={() => {}}
                        onStyleExtractModelChange={() => {}}
                        vocalSepModels={DEFAULT_VOCAL_SEPARATION_MODELS}
                        styleExtractModels={DEFAULT_STYLE_EXTRACTION_MODELS}
                      />
                    </ErrorBoundary>
                    <ErrorBoundary>
                      <StyleLibrary
                        styles={styles}
                        selectedId={selectedStyle?.id}
                        onSelect={setSelectedStyle}
                        onDelete={(id) => setStyles((prev) => prev.filter((s) => s.id !== id))}
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
                        musicGenModel="musicgen_small"
                        onMusicGenModelChange={() => {}}
                        musicGenModels={DEFAULT_MUSIC_GENERATION_MODELS}
                      />
                    </ErrorBoundary>
                    {currentPlayingMusic && <ErrorBoundary><MusicPlayer music={currentPlayingMusic} /></ErrorBoundary>}
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
                  onDelete={(id) => setStyles((prev) => prev.filter((s) => s.id !== id))}
                />
              </motion.div>
            )}

            {activeTab === "voice" && (
              <motion.div key="voice" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="max-w-2xl">
                <VoiceModelLibrary
                  models={voiceModels}
                  selectedId={selectedVoiceId}
                  onSelect={(model) => setSelectedVoiceId(model.id)}
                  onDelete={(id) => setVoiceModels((prev) => prev.filter((m) => m.id !== id))}
                />
              </motion.div>
            )}

            {activeTab === "history" && (
              <motion.div key="history" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="max-w-3xl space-y-5">
                <Playlist items={playlist} currentPlayingId={currentPlayingId} onPlay={handlePlay} />
                {currentPlayingMusic && <MusicPlayer music={currentPlayingMusic} />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
