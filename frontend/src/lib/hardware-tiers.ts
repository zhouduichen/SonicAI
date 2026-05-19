import type { HardwareTierConfig, PreferenceMode, TierPreset } from "@/types";

const PRESET_TIME: Record<string, Record<string, number>> = {
  ultra: { speed: 60, quality: 120 },
  high: { speed: 80, quality: 150 },
  mid: { speed: 90, quality: 180 },
  low: { speed: 120, quality: 160 },
  cpu: { speed: 180, quality: 300 },
};

export const HARDWARE_TIERS: HardwareTierConfig[] = [
  {
    tier: "ultra",
    label: "旗舰 (16G+)",
    maxVramGB: 16,
    presets: {
      speed: { vocalSepModel: "demucs_mdx_extra", styleExtractModel: "clap_laion", musicGenModel: "musicgen_medium" },
      quality: { vocalSepModel: "demucs_htdemucs", styleExtractModel: "clap_msclap", musicGenModel: "musicgen_large" },
    },
  },
  {
    tier: "high",
    label: "高端 (12G+)",
    maxVramGB: 12,
    presets: {
      speed: { vocalSepModel: "demucs_mdx_extra", styleExtractModel: "clap_laion", musicGenModel: "musicgen_medium" },
      quality: { vocalSepModel: "demucs_htdemucs", styleExtractModel: "clap_msclap", musicGenModel: "musicgen_melody" },
    },
  },
  {
    tier: "mid",
    label: "中端 (8G+)",
    maxVramGB: 8,
    presets: {
      speed: { vocalSepModel: "spleeter_2stems", styleExtractModel: "clap_laion", musicGenModel: "musicgen_small" },
      quality: { vocalSepModel: "spleeter_5stems", styleExtractModel: "clap_laion", musicGenModel: "musicgen_medium" },
    },
  },
  {
    tier: "low",
    label: "入门 (6G+)",
    maxVramGB: 6,
    presets: {
      speed: { vocalSepModel: "spleeter_2stems", styleExtractModel: "encodec_6kbps", musicGenModel: "musicgen_small" },
      quality: { vocalSepModel: "spleeter_5stems", styleExtractModel: "encodec_6kbps", musicGenModel: "musicgen_small" },
    },
  },
  {
    tier: "cpu",
    label: "CPU (无独显)",
    maxVramGB: 0,
    presets: {
      speed: { vocalSepModel: "spleeter_2stems", styleExtractModel: "encodec_6kbps", musicGenModel: "musicgen_small" },
      quality: { vocalSepModel: "spleeter_5stems", styleExtractModel: "clap_laion", musicGenModel: "musicgen_small" },
    },
  },
];

export function getTierConfig(tier: string): HardwareTierConfig | undefined {
  return HARDWARE_TIERS.find((t) => t.tier === tier);
}

export function getEstimatedTime(tier: string, mode: PreferenceMode): number {
  return PRESET_TIME[tier]?.[mode] ?? 120;
}
