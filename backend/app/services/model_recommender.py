"""Hardware tier → model preset mapping with VRAM validation."""

from dataclasses import dataclass
from typing import Literal

HardwareTier = Literal["ultra", "high", "mid", "low", "cpu"]
PreferenceMode = Literal["speed", "quality"]


@dataclass(frozen=True)
class TierPreset:
    vocal_sep_model: str
    style_extract_model: str
    music_gen_model: str


@dataclass(frozen=True)
class TierConfig:
    tier: HardwareTier
    label_cn: str
    max_vram_gb: float
    speed_preset: TierPreset
    quality_preset: TierPreset
    speed_time_seconds: int
    quality_time_seconds: int


TIER_CONFIGS: dict[HardwareTier, TierConfig] = {
    "ultra": TierConfig(
        tier="ultra",
        label_cn="旗舰 (16G+)",
        max_vram_gb=16.0,
        speed_preset=TierPreset("demucs_mdx_extra", "clap_laion", "musicgen_medium"),
        quality_preset=TierPreset("demucs_htdemucs", "clap_msclap", "musicgen_large"),
        speed_time_seconds=60,
        quality_time_seconds=120,
    ),
    "high": TierConfig(
        tier="high",
        label_cn="高端 (12G+)",
        max_vram_gb=12.0,
        speed_preset=TierPreset("demucs_mdx_extra", "clap_laion", "musicgen_medium"),
        quality_preset=TierPreset("demucs_htdemucs", "clap_msclap", "musicgen_melody"),
        speed_time_seconds=80,
        quality_time_seconds=150,
    ),
    "mid": TierConfig(
        tier="mid",
        label_cn="中端 (8G+)",
        max_vram_gb=8.0,
        speed_preset=TierPreset("spleeter_2stems", "clap_laion", "musicgen_small"),
        quality_preset=TierPreset("spleeter_5stems", "clap_laion", "musicgen_medium"),
        speed_time_seconds=90,
        quality_time_seconds=180,
    ),
    "low": TierConfig(
        tier="low",
        label_cn="入门 (6G+)",
        max_vram_gb=6.0,
        speed_preset=TierPreset("spleeter_2stems", "encodec_6kbps", "musicgen_small"),
        quality_preset=TierPreset("spleeter_5stems", "encodec_6kbps", "musicgen_small"),
        speed_time_seconds=120,
        quality_time_seconds=160,
    ),
    "cpu": TierConfig(
        tier="cpu",
        label_cn="CPU (无独显)",
        max_vram_gb=0.0,
        speed_preset=TierPreset("spleeter_2stems", "encodec_6kbps", "musicgen_small"),
        quality_preset=TierPreset("spleeter_5stems", "clap_laion", "musicgen_small"),
        speed_time_seconds=180,
        quality_time_seconds=300,
    ),
}


def get_tier_config(tier: str) -> TierConfig:
    """Return tier config or fallback to 'ultra'."""
    return TIER_CONFIGS.get(tier, TIER_CONFIGS["ultra"])


def get_preset(tier: str, mode: PreferenceMode = "speed") -> TierPreset:
    config = get_tier_config(tier)
    return config.speed_preset if mode == "speed" else config.quality_preset


def validate_vram(model_vram_gb: float, tier_budget: float) -> bool:
    """Check if a single model fits within the tier's VRAM budget."""
    if tier_budget <= 0:
        return True  # CPU tier, no VRAM check
    return model_vram_gb <= tier_budget
