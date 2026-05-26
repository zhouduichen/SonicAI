import type { HardwareTier, HardwareTierConfig, PreferenceMode, ProcessingMode } from "@/types";

const PRESET_TIME: Record<HardwareTier, Record<PreferenceMode, number>> = {
  ultra: { speed: 60, balanced: 80, quality: 120 },
  high: { speed: 80, balanced: 110, quality: 150 },
  mid: { speed: 90, balanced: 140, quality: 180 },
  low: { speed: 120, balanced: 140, quality: 160 },
  cpu: { speed: 180, balanced: 240, quality: 300 },
};

export const HARDWARE_TIERS: HardwareTierConfig[] = [
  {
    tier: "ultra",
    label: "旗舰 (16G+)",
    maxVramGB: 16,
    presets: {
      speed: { vocalSepModel: "demucs_mdx_extra", styleExtractModel: "clap_laion", musicGenModel: "musicgen_medium" },
      balanced: { vocalSepModel: "demucs_htdemucs", styleExtractModel: "clap_laion", musicGenModel: "musicgen_melody" },
      quality: { vocalSepModel: "demucs_htdemucs", styleExtractModel: "clap_msclap", musicGenModel: "musicgen_large" },
    },
  },
  {
    tier: "high",
    label: "高端 (12G+)",
    maxVramGB: 12,
    presets: {
      speed: { vocalSepModel: "demucs_mdx_extra", styleExtractModel: "clap_laion", musicGenModel: "musicgen_medium" },
      balanced: { vocalSepModel: "demucs_htdemucs", styleExtractModel: "clap_laion", musicGenModel: "musicgen_melody" },
      quality: { vocalSepModel: "demucs_htdemucs", styleExtractModel: "clap_msclap", musicGenModel: "musicgen_melody" },
    },
  },
  {
    tier: "mid",
    label: "中端 (8G+)",
    maxVramGB: 8,
    presets: {
      speed: { vocalSepModel: "spleeter_2stems", styleExtractModel: "clap_laion", musicGenModel: "musicgen_small" },
      balanced: { vocalSepModel: "spleeter_5stems", styleExtractModel: "clap_laion", musicGenModel: "musicgen_medium" },
      quality: { vocalSepModel: "spleeter_5stems", styleExtractModel: "clap_laion", musicGenModel: "musicgen_medium" },
    },
  },
  {
    tier: "low",
    label: "入门 (6G+)",
    maxVramGB: 6,
    presets: {
      speed: { vocalSepModel: "spleeter_2stems", styleExtractModel: "encodec_6kbps", musicGenModel: "musicgen_small" },
      balanced: { vocalSepModel: "spleeter_5stems", styleExtractModel: "encodec_6kbps", musicGenModel: "musicgen_small" },
      quality: { vocalSepModel: "spleeter_5stems", styleExtractModel: "encodec_6kbps", musicGenModel: "musicgen_small" },
    },
  },
  {
    tier: "cpu",
    label: "CPU (无独显)",
    maxVramGB: 0,
    presets: {
      speed: { vocalSepModel: "spleeter_2stems", styleExtractModel: "encodec_6kbps", musicGenModel: "musicgen_small" },
      balanced: { vocalSepModel: "spleeter_5stems", styleExtractModel: "clap_laion", musicGenModel: "musicgen_small" },
      quality: { vocalSepModel: "spleeter_5stems", styleExtractModel: "clap_laion", musicGenModel: "musicgen_small" },
    },
  },
];

export function getTierConfig(tier: HardwareTier): HardwareTierConfig {
  return HARDWARE_TIERS.find((t) => t.tier === tier)!;
}

export function getEstimatedTime(tier: HardwareTier, mode: PreferenceMode): number {
  return PRESET_TIME[tier][mode];
}

export const PREFERENCE_LABELS: Record<PreferenceMode, { label: string; sub: string; icon: string }> = {
  speed: { label: "快速", sub: "优先速度", icon: "⚡" },
  balanced: { label: "平衡", sub: "均衡之选", icon: "⚖" },
  quality: { label: "高质量", sub: "最佳效果", icon: "♛" },
};

export const PROCESSING_MODE_LABELS: Record<ProcessingMode, { label: string; sub: string }> = {
  auto: { label: "自动", sub: "系统选择" },
  sync: { label: "即时", sub: "直接处理" },
  async: { label: "后台", sub: "需要 Redis" },
};
