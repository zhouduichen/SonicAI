from dataclasses import dataclass
from typing import Literal
from pydantic_settings import BaseSettings
from functools import lru_cache

# === Hardware tier data structures (shared across models/providers and services) ===

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
        tier="ultra", label_cn="旗舰 (16G+)", max_vram_gb=16.0,
        speed_preset=TierPreset("demucs_mdx_extra", "clap_laion", "musicgen_medium"),
        quality_preset=TierPreset("demucs_htdemucs", "clap_msclap", "musicgen_large"),
        speed_time_seconds=60, quality_time_seconds=120,
    ),
    "high": TierConfig(
        tier="high", label_cn="高端 (12G+)", max_vram_gb=12.0,
        speed_preset=TierPreset("demucs_mdx_extra", "clap_laion", "musicgen_medium"),
        quality_preset=TierPreset("demucs_htdemucs", "clap_msclap", "musicgen_melody"),
        speed_time_seconds=80, quality_time_seconds=150,
    ),
    "mid": TierConfig(
        tier="mid", label_cn="中端 (8G+)", max_vram_gb=8.0,
        speed_preset=TierPreset("spleeter_2stems", "clap_laion", "musicgen_small"),
        quality_preset=TierPreset("spleeter_5stems", "clap_laion", "musicgen_medium"),
        speed_time_seconds=90, quality_time_seconds=180,
    ),
    "low": TierConfig(
        tier="low", label_cn="入门 (6G+)", max_vram_gb=6.0,
        speed_preset=TierPreset("spleeter_2stems", "encodec_6kbps", "musicgen_small"),
        quality_preset=TierPreset("spleeter_5stems", "encodec_6kbps", "musicgen_small"),
        speed_time_seconds=120, quality_time_seconds=160,
    ),
    "cpu": TierConfig(
        tier="cpu", label_cn="CPU (无独显)", max_vram_gb=0.0,
        speed_preset=TierPreset("spleeter_2stems", "encodec_6kbps", "musicgen_small"),
        quality_preset=TierPreset("spleeter_5stems", "clap_laion", "musicgen_small"),
        speed_time_seconds=180, quality_time_seconds=300,
    ),
}


def get_tier_config(tier: str) -> TierConfig:
    return TIER_CONFIGS.get(tier, TIER_CONFIGS["ultra"])


def get_preset(tier: str, mode: PreferenceMode = "speed") -> TierPreset:
    config = get_tier_config(tier)
    return config.speed_preset if mode == "speed" else config.quality_preset


def validate_vram(model_vram_gb: float, tier_budget: float) -> bool:
    if tier_budget <= 0:
        return True
    return model_vram_gb <= tier_budget


# === Pydantic settings ===


class Settings(BaseSettings):
    # App
    APP_NAME: str = "SonicAI"
    DEBUG: bool = True
    SECRET_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Database — SQLite for dev, swap to PostgreSQL later
    DATABASE_URL: str = "sqlite:///./aimusic.db"

    # Redis (Celery broker)
    REDIS_URL: str = "redis://localhost:6379/0"

    # File storage
    UPLOAD_DIR: str = "./uploads"
    GENERATED_DIR: str = "./generated"

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Hardware tier
    SONICAI_HARDWARE_TIER: str = "ultra"
    SONICAI_PREFERENCE: str = "speed"
    SONICAI_ALLOW_CPU_TRAINING: bool = False

    # Admin — production must set DEFAULT_ADMIN_PASSWORD; dev defaults to admin123
    DEFAULT_ADMIN_PASSWORD: str = ""

    # LLM / Prompt Suggestions
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:7b"
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com"
    OPENAI_MODEL: str = "gpt-4o-mini"
    SUGGESTION_TIMEOUT_SECONDS: int = 45

    # External SVS service (GPT-SoVITS / Bert-VITS2)
    SVS_API_URL: str = ""

    # Mock fallback control — set to False in production to prevent silent fake audio
    ENABLE_MOCK_FALLBACK: bool = True

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
