"use client";

import { useState, useCallback, useEffect } from "react";
import type { AudioAsset, StyleTag, ProcessingMode } from "@/types";
import * as api from "@/lib/api";
import { useToast } from "@/components/Toast";
import { logError } from "@/lib/error-handler";

const POLL_INTERVAL = 2000;
export const AUDIO_JOB_TIMEOUT_MS = 1_800_000;

interface AudioAssetApiItem {
  id: number; file_name: string; file_path: string; status: string;
  vocal_sep_model?: string;
  style_vector?: { id: number; style_name: string; asset_id: number; style_extract_model: string; created_at: string } | null;
  created_at?: string;
}

function buildState(items: AudioAssetApiItem[]): {
  assets: AudioAsset[];
  styles: StyleTag[];
} {
  const assets: AudioAsset[] = items.map((a) => ({
    id: String(a.id),
    fileName: a.file_name,
    filePath: a.file_path,
    status: a.status as AudioAsset["status"],
    vocalSepModel: a.vocal_sep_model,
    uploadedAt: a.created_at || "",
  }));
  const styles: StyleTag[] = [];
  for (const a of items) {
    if (a.style_vector) {
      styles.push({
        id: String(a.style_vector.id),
        name: a.style_vector.style_name,
        assetId: String(a.style_vector.asset_id),
        embedding: [],
        styleExtractModel: a.style_vector.style_extract_model,
        createdAt: a.style_vector.created_at?.split("T")[0] || "",
      });
    }
  }
  return { assets, styles };
}

export function useAudioAssets() {
  const { toast } = useToast();
  const [uploadingAssets, setUploadingAssets] = useState<AudioAsset[]>([]);
  const [styles, setStyles] = useState<StyleTag[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<StyleTag | null>(null);

  const reloadAssets = useCallback(async () => {
    try {
      const data = await api.getAudioAssets();
      const { assets, styles: freshStyles } = buildState(data.items);
      setUploadingAssets(assets);
      setStyles(freshStyles);
    } catch (err) { logError("reloadAssets", err); }
  }, []);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getAudioAssets();
        if (cancelled) return;
        const { assets, styles: freshStyles } = buildState(data.items);
        if (assets.length > 0 || styles.length > 0) {
          setUploadingAssets(assets);
          setStyles(freshStyles);
          return;
        }
      } catch { /* API unavailable */ }
      // Demo fallback
      if (cancelled) return;
      const { MOCK_ASSETS, MOCK_STYLES } = await import("@/lib/mock-data");
      setUploadingAssets(MOCK_ASSETS);
      setStyles(MOCK_STYLES);
      if (MOCK_STYLES.length > 0) setSelectedStyle(MOCK_STYLES[0]);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const hasProcessing = uploadingAssets.some((asset) => asset.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      reloadAssets().catch((err) => logError("useAudioAssets:poll", err));
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [uploadingAssets, reloadAssets]);

  const handleUpload = useCallback(async (
    file: File,
    vocalSepModel: string,
    styleExtractModel: string,
    processingMode: ProcessingMode,
  ) => {
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
      const { asset_id, job_id } = await api.uploadAudio(
        file, vocalSepModel, styleExtractModel, processingMode,
      );

      // Replace temp id with real id
      setUploadingAssets((prev) =>
        prev.map((a) => (a.id === tempId ? { ...a, id: String(asset_id) } : a)),
      );

      // If no job (sync immediate completion), just reload
      if (!job_id) {
        await reloadAssets();
        return;
      }

      let timeout: ReturnType<typeof setTimeout> | null = null;
      let interval: ReturnType<typeof setInterval> | null = null;
      let stopped = false;

      const stopPolling = () => {
        stopped = true;
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
      };

      const pollJobStatus = async () => {
        if (stopped) return;
        try {
          const job = await api.getJob(job_id);
          if (job.status === "completed") {
            stopPolling();
            await reloadAssets();
            toast("音频处理完成", {
              description: `${file.name} 已提取风格`,
              variant: "success",
            });
          } else if (job.status === "failed") {
            stopPolling();
            setUploadingAssets((prev) =>
              prev.map((a) => (a.id === String(asset_id) ? { ...a, status: "failed" } : a)),
            );
            toast("音频处理失败", {
              description: job.error_message || `${file.name} 处理出错`,
              variant: "error",
            });
          }
        } catch { /* keep polling */ }
      };

      await pollJobStatus();
      if (stopped) return;

      interval = setInterval(pollJobStatus, POLL_INTERVAL);

      timeout = setTimeout(() => {
        stopPolling();
        reloadAssets().catch((err) => logError("useAudioAssets:timeoutReload", err));
        toast("音频仍在处理", {
          description: `${file.name} 仍在后台处理中，可在任务中心查看`,
          variant: "warning",
        });
      }, AUDIO_JOB_TIMEOUT_MS);
    } catch (e: any) {
      setUploadingAssets((prev) =>
        prev.map((a) => (a.id === tempId ? { ...a, status: "failed" } : a)),
      );
      toast("上传失败", {
        description: e?.message || "请检查网络连接",
        variant: "error",
      });
    }
  }, [reloadAssets, toast]);

  const handleDeleteStyle = useCallback(async (styleId: string) => {
    const style = styles.find((s) => s.id === styleId);
    if (style) {
      try { await api.deleteAudioAsset(style.assetId); } catch (err) { logError("deleteStyle:deleteAudioAsset", err); }
    }
    await reloadAssets();
    if (selectedStyle?.id === styleId) setSelectedStyle(null);
  }, [styles, selectedStyle, reloadAssets]);

  return {
    uploadingAssets,
    styles,
    selectedStyle,
    setSelectedStyle,
    setUploadingAssets,
    setStyles,
    handleUpload,
    handleDeleteStyle,
  };
}
