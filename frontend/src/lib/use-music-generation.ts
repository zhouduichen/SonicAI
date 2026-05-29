"use client";

import { useState, useCallback } from "react";
import type { GeneratedMusic, StyleTag, ProcessingMode } from "@/types";
import * as api from "@/lib/api";
import { useToast } from "@/components/Toast";
import { logError } from "@/lib/error-handler";

const POLL_INTERVAL = 2000;
const POLL_TIMEOUT = 300_000;
const BATCH_POLL_INTERVAL = 3000;
const BATCH_POLL_TIMEOUT = 600_000;

function musicFromJobResult(job: api.JobInfo, styleName: string): GeneratedMusic | null {
  const r = job.result as Record<string, unknown> | null;
  if (!r) return null;
  return {
    id: String(r.music_id ?? job.id),
    title: (r.title as string) || "",
    prompt: (r.prompt as string) || "",
    styleName,
    filePath: (r.file_path as string) || "",
    duration: (r.duration_seconds as number) || 0,
    musicGenModel: (r.music_gen_model as string) || undefined,
    providerMode: (r.provider_mode as "real" | "mock") || undefined,
    createdAt: new Date().toISOString().split("T")[0],
  };
}

export function useMusicGeneration() {
  const { toast } = useToast();
  const [playlist, setPlaylist] = useState<GeneratedMusic[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBlendGenerating, setIsBlendGenerating] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchCells, setBatchCells] = useState<
    { task_id: string; prompt: string; model: string; status: string; file_path?: string }[]
  >([]);

  const handleGenerate = useCallback(async (
    selectedStyle: StyleTag,
    prompt: string,
    musicGenModel: string,
    processingMode: ProcessingMode,
  ) => {
    setIsGenerating(true);
    try {
      const { job_id } = await api.generateMusic(
        Number(selectedStyle.id), prompt, musicGenModel, processingMode,
      );

      if (!job_id) { setIsGenerating(false); return; }

      // Check once immediately (handles sync mode where job finishes instantly)
      try {
        const job = await api.getJob(job_id);
        if (job.status === "completed") {
          const music = musicFromJobResult(job, selectedStyle.name);
          if (music) setPlaylist((prev) => [music, ...prev]);
          toast("音乐生成完成", { variant: "success" });
          setIsGenerating(false);
          return;
        }
        if (job.status === "failed") {
          toast("音乐生成失败", { description: job.error_message || "", variant: "error" });
          setIsGenerating(false);
          return;
        }
      } catch { /* not done yet, start polling */ }

      let timeout: ReturnType<typeof setTimeout>;
      const interval = setInterval(async () => {
        try {
          const job = await api.getJob(job_id);
          if (job.status === "completed") {
            clearInterval(interval);
            clearTimeout(timeout);
            const music = musicFromJobResult(job, selectedStyle.name);
            if (music) setPlaylist((prev) => [music, ...prev]);
            setIsGenerating(false);
            toast("音乐生成完成", { variant: "success" });
          } else if (job.status === "failed") {
            clearInterval(interval);
            clearTimeout(timeout);
            setIsGenerating(false);
            toast("音乐生成失败", {
              description: job.error_message || "",
              variant: "error",
            });
          }
        } catch { /* keep polling */ }
      }, POLL_INTERVAL);

      timeout = setTimeout(() => {
        clearInterval(interval);
        setIsGenerating(false);
        toast("音乐生成超时", {
          description: "处理时间过长，请重试",
          variant: "error",
        });
      }, POLL_TIMEOUT);
    } catch (e: any) {
      setIsGenerating(false);
      toast("生成请求失败", {
        description: e?.message || "请检查服务状态",
        variant: "error",
      });
    }
  }, [toast]);

  const handleBlendGenerate = useCallback(async (
    blends: { style_vector_id: number; weight: number }[],
    prompt: string,
    blendMusicGenModel: string,
    processingMode: ProcessingMode,
  ) => {
    setIsBlendGenerating(true);
    try {
      const { job_id } = await api.blendGenerate(
        blends, prompt, blendMusicGenModel, processingMode,
      );

      if (!job_id) { setIsBlendGenerating(false); return; }

      try {
        const job = await api.getJob(job_id);
        if (job.status === "completed") {
          const music = musicFromJobResult(job, `混合 (${blends.length} 风格)`);
          if (music) setPlaylist((prev) => [music, ...prev]);
          toast("混合生成完成", { variant: "success" });
          setIsBlendGenerating(false);
          return;
        }
        if (job.status === "failed") {
          toast("混合生成失败", { description: job.error_message || "", variant: "error" });
          setIsBlendGenerating(false);
          return;
        }
      } catch { /* not done yet */ }

      let timeout: ReturnType<typeof setTimeout>;
      const interval = setInterval(async () => {
        try {
          const job = await api.getJob(job_id);
          if (job.status === "completed") {
            clearInterval(interval);
            clearTimeout(timeout);
            const music = musicFromJobResult(job, `混合 (${blends.length} 风格)`);
            if (music) setPlaylist((prev) => [music, ...prev]);
            setIsBlendGenerating(false);
            toast("混合生成完成", { variant: "success" });
          } else if (job.status === "failed") {
            clearInterval(interval);
            clearTimeout(timeout);
            setIsBlendGenerating(false);
            toast("混合生成失败", {
              description: job.error_message || "",
              variant: "error",
            });
          }
        } catch { /* keep polling */ }
      }, POLL_INTERVAL);

      timeout = setTimeout(() => {
        clearInterval(interval);
        setIsBlendGenerating(false);
        toast("混合生成超时", {
          description: "处理时间过长，请重试",
          variant: "error",
        });
      }, POLL_TIMEOUT);
    } catch (e: any) {
      setIsBlendGenerating(false);
      toast("混合请求失败", {
        description: e?.message || "请检查服务状态",
        variant: "error",
      });
    }
  }, [toast]);

  const handleBatchGenerate = useCallback(async (
    selectedStyle: StyleTag,
    prompts: string[],
    models: string[],
    processingMode: ProcessingMode,
  ) => {
    setIsBatchGenerating(true);
    setBatchCells([]);
    try {
      const { batch_id, tasks } = await api.batchGenerate(
        Number(selectedStyle.id), prompts, models, processingMode,
      );
      setBatchCells(tasks.map((t) => ({ ...t, status: "pending" })));

      // Batch still uses Redis-based polling (one job → N Celery tasks)
      let timeout: ReturnType<typeof setTimeout>;
      const interval = setInterval(async () => {
        try {
          const batchStatus = await api.pollBatchStatus(batch_id);
          setBatchCells(
            batchStatus.cells.map((c: {
              task_id: string; prompt: string; model: string; status: string; music_id?: number; file_path?: string;
            }) => ({
              task_id: c.task_id,
              prompt: c.prompt,
              model: c.model,
              status: c.status,
              file_path: c.file_path,
            })),
          );
          const done =
            batchStatus.completed +
            batchStatus.cells.filter((c: { status: string }) => c.status === "failed").length;
          if (batchStatus.total > 0 && done >= batchStatus.total) {
            clearInterval(interval);
            clearTimeout(timeout);
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
            const failedCount = batchStatus.cells.filter(
              (c: { status: string }) => c.status === "failed",
            ).length;
            if (failedCount > 0) {
              toast("批量生成完成", {
                description: `${batchStatus.completed} 成功，${failedCount} 失败`,
                variant: "warning",
              });
            } else {
              toast("批量生成完成", { variant: "success" });
            }
          }
        } catch { /* keep polling */ }
      }, BATCH_POLL_INTERVAL);

      timeout = setTimeout(() => {
        clearInterval(interval);
        setIsBatchGenerating(false);
        toast("批量生成超时", {
          description: "部分任务未完成，请重试",
          variant: "error",
        });
      }, BATCH_POLL_TIMEOUT);
    } catch (e: any) {
      setIsBatchGenerating(false);
      toast("批量生成失败", {
        description: e?.message || "请检查服务状态",
        variant: "error",
      });
    }
  }, [toast]);

  const loadPlaylist = useCallback(async () => {
    try {
      const musicData = await api.getMusicList();
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
      if (loadedPlaylist.length > 0) {
        setPlaylist(loadedPlaylist);
        return;
      }
    } catch { /* API unavailable — keep empty state */ }
    // Empty state is correct; no mock fallback.
  }, []);

  return {
    playlist,
    setPlaylist,
    isGenerating,
    isBlendGenerating,
    isBatchGenerating,
    batchCells,
    setBatchCells,
    handleGenerate,
    handleBlendGenerate,
    handleBatchGenerate,
    loadPlaylist,
  };
}
