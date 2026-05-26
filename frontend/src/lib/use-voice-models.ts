"use client";

import { useState, useCallback, useEffect } from "react";
import type { VoiceModel, VocalGeneration, ProcessingMode } from "@/types";
import * as api from "@/lib/api";
import { useToast } from "@/components/Toast";
import { logError } from "@/lib/error-handler";

export function useVoiceModels(activeTab: string) {
  const { toast } = useToast();
  const [voiceModels, setVoiceModels] = useState<VoiceModel[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | undefined>(undefined);
  const [vocalGenerations, setVocalGenerations] = useState<VocalGeneration[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [isSinging, setIsSinging] = useState(false);
  const [singError, setSingError] = useState<string | null>(null);

  // Fetch voice models when switching to voice or song tab
  useEffect(() => {
    if (activeTab !== "create" && activeTab !== "assets") return;
    let cancelled = false;
    api.getVoiceModels().then((models) => {
      if (!cancelled) setVoiceModels(models);
    }).catch((err) => logError("useVoiceModels:fetch", err));
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
            const status = await api.pollVoiceStatus(id);
            return {
              id, status: status.status as VoiceModel["status"],
              epoch: status.current_epoch,
              targetEpochs: status.total_epochs,
              qualityTier: (status.current_tier || status.available_tiers[status.available_tiers.length - 1] || "preview") as VoiceModel["qualityTier"],
            };
          } catch { return { id, status: "training" as const, epoch: 0, targetEpochs: undefined, qualityTier: "preview" as const }; }
        })
      );
      if (!active) return;
      setVoiceModels((prev) =>
        prev.map((m) => {
          const u = updated.find((x) => x.id === m.id);
          return u ? { ...m, status: u.status, epoch: u.epoch, targetEpochs: u.targetEpochs ?? m.targetEpochs, qualityTier: u.qualityTier } : m;
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
          try { return await api.pollVocalGeneration(Number(id)); }
          catch { return null; }
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
    await api.deleteVoiceModel(id).catch(() => {});
  }, [selectedVoiceId]);

  const handleTrainVoice = useCallback(async (
    audioAssetIds: number[], name: string, qualityTarget: string,
  ) => {
    try {
      const { model_id, job_id } = await api.trainVoice(audioAssetIds, name, qualityTarget);
      const newModel: VoiceModel = {
        id: String(model_id), name, sourceAudioIds: audioAssetIds,
        status: "preprocessing", epoch: 0, qualityTier: "preview",
        targetEpochs: qualityTarget === "preview" ? 20 : qualityTarget === "standard" ? 100 : 200,
        durationSeconds: 0, createdAt: new Date().toISOString(),
      };
      setVoiceModels((prev) => [newModel, ...prev]);
      toast("声音训练任务已提交", {
        description: job_id ? `任务 #${job_id} 已进入队列` : `${name} 已开始训练`,
        variant: "success",
      });
    } catch (e: any) {
      setIsTraining(false);
      toast("声音训练没有启动", {
        description: e?.message || "请确认 Redis 和 Celery Worker 已启动",
        variant: "error",
      });
      throw e;
    }
  }, [toast]);

  const handleSingVoice = useCallback(async (
    selectedVoiceId: string, singRefAssetId: string, processingMode: ProcessingMode,
  ) => {
    setIsSinging(true);
    setSingError(null);
    try {
      const { generation_id, status: immediateStatus } = await api.singVoice(selectedVoiceId, singRefAssetId, processingMode);

      const newGen: VocalGeneration = {
        id: String(generation_id), voiceModelId: selectedVoiceId, outputPath: "",
        status: immediateStatus === "completed" ? "completed" : immediateStatus === "processing" ? "processing" : "pending",
        durationSeconds: 0, createdAt: new Date().toISOString(),
      };
      setVocalGenerations((prev) => [newGen, ...prev]);

      if (immediateStatus === "completed") { setIsSinging(false); return; }

      let timeout: ReturnType<typeof setTimeout>;
      const interval = setInterval(async () => {
        try {
          const status = await api.pollVocalGeneration(generation_id);
          setVocalGenerations((prev) =>
            prev.map((g) => (g.id === String(generation_id) ? status : g))
          );
          if (status.status === "completed" || status.status === "failed") {
            clearInterval(interval);
            clearTimeout(timeout);
            setIsSinging(false);
            if (status.status === "failed") setSingError("人声生成失败，请检查声音模型和参考音频");
          }
        } catch { /* keep polling */ }
      }, 2000);
      timeout = setTimeout(() => {
        clearInterval(interval);
        setIsSinging(false);
        setSingError("人声生成超时");
        toast("人声生成超时", { description: "处理时间过长，请检查声音模型", variant: "error" });
      }, 300000);
    } catch (e: any) {
      setSingError(e.message || "人声生成失败");
      setIsSinging(false);
    }
  }, [toast]);

  return {
    voiceModels, setVoiceModels, selectedVoiceId, setSelectedVoiceId,
    vocalGenerations, setVocalGenerations,
    isTraining, setIsTraining, isSinging, singError,
    handleDeleteVoice, handleTrainVoice, handleSingVoice,
  };
}
