import { API_BASE, authHeaders } from "@/lib/auth";
import type { ProcessingMode, VoiceModel, VocalGeneration, Song } from "@/types";

const VOICE_TARGET_EPOCHS: Record<string, number> = {
  preview: 20,
  standard: 100,
  premium: 200,
};

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string" && data.detail.trim()) return data.detail;
    if (typeof data?.message === "string" && data.message.trim()) return data.message;
  } catch {}
  try {
    const text = await res.text();
    if (text.trim()) return text.trim();
  } catch {}
  return `${fallback} (${res.status})`;
}

// ───────── Audio Upload ─────────

export async function uploadAudio(
  file: File,
  vocalSepModel: string,
  styleExtractModel: string,
  processingMode: ProcessingMode = "auto",
): Promise<{ asset_id: number; task_id: string; job_id?: number }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("vocal_sep_model", vocalSepModel);
  formData.append("style_extract_model", styleExtractModel);
  const res = await fetch(`${API_BASE}/audio/upload?processing_mode=${processingMode}`, {
    method: "POST",
    body: formData,
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await readApiError(res, "Upload failed"));
  return res.json();
}

export async function pollAudioStatus(taskId: string) {
  const res = await fetch(`${API_BASE}/audio/status/${taskId}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Status check failed");
  return res.json();
}

export async function getAudioAssets(): Promise<{
  items: {
    id: number; file_name: string; file_path: string; status: string;
    vocal_sep_model?: string;
    style_vector?: { id: number; style_name: string; asset_id: number; style_extract_model: string; created_at: string } | null;
    created_at?: string;
  }[];
  total: number;
}> {
  const res = await fetch(`${API_BASE}/audio/list`, { headers: await authHeaders() });
  if (!res.ok) return { items: [], total: 0 };
  return res.json();
}

export async function deleteAudioAsset(assetId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/audio/${assetId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  return res.ok;
}

// ───────── Music Generation ─────────

export async function generateMusic(
  vectorId: number,
  prompt: string,
  musicGenModel: string,
  processingMode: ProcessingMode = "auto",
): Promise<{ task_id: string; job_id?: number }> {
  const res = await fetch(`${API_BASE}/music/generate?processing_mode=${processingMode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ style_vector_id: vectorId, text_prompt: prompt, music_gen_model: musicGenModel }),
  });
  if (!res.ok) throw new Error("Generation failed");
  return res.json();
}

export async function pollMusicStatus(taskId: string) {
  const res = await fetch(`${API_BASE}/music/status/${taskId}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Music status check failed");
  return res.json();
}

export async function blendGenerate(
  blends: { style_vector_id: number; weight: number }[],
  prompt: string,
  musicGenModel: string,
  processingMode: ProcessingMode = "auto",
): Promise<{ task_id: string; job_id?: number }> {
  const res = await fetch(`${API_BASE}/music/blend-generate?processing_mode=${processingMode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ blends, text_prompt: prompt, music_gen_model: musicGenModel }),
  });
  if (!res.ok) throw new Error("Blend generation failed");
  return res.json();
}

export async function batchGenerate(
  styleVectorId: number,
  prompts: string[],
  models: string[],
  processingMode: ProcessingMode = "auto",
): Promise<{ batch_id: string; tasks: { task_id: string; prompt: string; model: string }[] }> {
  const res = await fetch(`${API_BASE}/music/generate-batch?processing_mode=${processingMode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ style_vector_id: styleVectorId, prompts, music_gen_models: models }),
  });
  if (!res.ok) throw new Error("Batch generation failed");
  return res.json();
}

export async function pollBatchStatus(batchId: string) {
  const res = await fetch(`${API_BASE}/music/batch/${batchId}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Batch status check failed");
  return res.json();
}

export async function fetchSuggestions(styleVectorId: number): Promise<string[]> {
  const res = await fetch(`${API_BASE}/music/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ style_vector_id: styleVectorId }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.suggestions || [];
}

// ───────── Music List ─────────

export async function getMusicList(): Promise<{
  items: {
    id: number; title: string; prompt: string; style_name: string;
    file_path: string; duration_seconds: number; music_gen_model?: string;
    provider_mode?: string; created_at: string;
  }[];
  total: number;
}> {
  const res = await fetch(`${API_BASE}/music/list`, { headers: await authHeaders() });
  if (!res.ok) return { items: [], total: 0 };
  return res.json();
}

// ───────── Voice Models ─────────

export async function getVoiceModels(): Promise<VoiceModel[]> {
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
    targetEpochs: VOICE_TARGET_EPOCHS[item.quality_tier || "preview"] || 200,
    durationSeconds: item.duration_seconds || 0,
    createdAt: item.created_at || "",
  }));
}

export async function trainVoice(
  audioAssetIds: number[], name: string, qualityTarget: string,
): Promise<{ model_id: number; job_id?: number }> {
  const res = await fetch(`${API_BASE}/voice/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ audio_asset_ids: audioAssetIds, name, quality_target: qualityTarget }),
  });
  if (!res.ok) throw new Error(await readApiError(res, "Voice training failed"));
  return res.json();
}

export async function deleteVoiceModel(modelId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/voice/models/${modelId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  return res.ok;
}

export async function pollVoiceStatus(modelId: string): Promise<{
  status: string; current_epoch: number; total_epochs: number; current_tier: string; available_tiers: string[];
}> {
  const res = await fetch(`${API_BASE}/voice/status/${modelId}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error("Status check failed");
  return res.json();
}

export async function singVoice(
  voiceModelId: string, referenceAudioId: string, processingMode: ProcessingMode = "auto",
): Promise<{ generation_id: number; job_id?: number; status?: string }> {
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

export async function pollVocalGeneration(generationId: number): Promise<VocalGeneration> {
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

// ───────── Songs ─────────

export async function getSongList(): Promise<{ items: SongItem[]; total: number }> {
  const res = await fetch(`${API_BASE}/song/list`, { headers: await authHeaders() });
  if (!res.ok) return { items: [], total: 0 };
  return res.json();
}

export interface SongItem {
  id: number; theme: string; status: string; lyrics: string;
  instrumental_path: string; raw_vocal_path: string; vocal_path: string;
  converted_vocal_path: string; mixed_path: string; created_at: string;
  error_message: string; lyrics_provider: string;
  instrumental_provider: string; svs_provider: string; vocal_provider: string;
  has_vocals: boolean;
}

// ───────── Jobs (unified polling) ─────────

export interface JobInfo {
  id: number;
  kind: string;
  status: string;
  progress: number;
  stage: string | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  celery_task_id: string | null;
  created_at: string;
  updated_at: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface JobListResponse {
  items: JobInfo[];
  total: number;
}

export async function getJob(jobId: number): Promise<JobInfo> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Job fetch failed");
  return res.json();
}

export async function listJobs(offset = 0, limit = 20): Promise<JobListResponse> {
  const res = await fetch(`${API_BASE}/jobs/?offset=${offset}&limit=${limit}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return { items: [], total: 0 };
  return res.json();
}

export async function cancelJob(jobId: number): Promise<JobInfo> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/cancel`, {
    method: "POST",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Job cancel failed");
  return res.json();
}

export async function deleteJob(jobId: number): Promise<boolean> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  return res.ok;
}
