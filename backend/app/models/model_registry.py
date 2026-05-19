"""All available AI models for each pipeline stage. Single source of truth."""

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class ModelInfo:
    key: str
    display_name: str
    description: str
    vram_gb: float
    quality: str
    speed: str
    embedding_dim: int | None = None


# === Vocal Separation Models ===

VOCAL_SEP_MODELS: list[ModelInfo] = [
    ModelInfo(
        key="demucs_htdemucs",
        display_name="Demucs (htdemucs)",
        description="Hybrid transformer 6-source separation. Best quality overall.",
        vram_gb=6.5,
        quality="最高",
        speed="较慢",
    ),
    ModelInfo(
        key="demucs_mdx_extra",
        display_name="Demucs (MDX Extra)",
        description="MDX-trained variant with extra data. Excellent vocal isolation.",
        vram_gb=5.0,
        quality="很高",
        speed="中等",
    ),
    ModelInfo(
        key="demucs_6s",
        display_name="Demucs (6-Source)",
        description="Full 6-source: vocals, drums, bass, other, piano, guitar.",
        vram_gb=4.5,
        quality="高",
        speed="中等",
    ),
    ModelInfo(
        key="spleeter_2stems",
        display_name="Spleeter (2-stem)",
        description="Fast 2-stem separation. Great speed/quality balance for development.",
        vram_gb=1.5,
        quality="中",
        speed="很快",
    ),
    ModelInfo(
        key="spleeter_5stems",
        display_name="Spleeter (5-stem)",
        description="5-stem separation. Useful for multi-track extraction.",
        vram_gb=2.0,
        quality="中高",
        speed="快",
    ),
]

VocalSepModelKey = Literal[
    "demucs_htdemucs", "demucs_mdx_extra", "demucs_6s",
    "spleeter_2stems", "spleeter_5stems",
]


# === Style Extraction Models ===

STYLE_EXTRACT_MODELS: list[ModelInfo] = [
    ModelInfo(
        key="clap_laion",
        display_name="CLAP (LAION-Audio)",
        description="512-dim LAION-CLAP audio encoder. General-purpose style capture.",
        vram_gb=1.2,
        quality="高",
        speed="快",
        embedding_dim=512,
    ),
    ModelInfo(
        key="clap_msclap",
        display_name="CLAP (MS-CLAP)",
        description="Microsoft CLAP fine-tuned on diverse music. Better genre discrimination.",
        vram_gb=1.5,
        quality="很高",
        speed="中等",
        embedding_dim=1024,
    ),
    ModelInfo(
        key="clap_htsat",
        display_name="CLAP (HTSAT-Huge)",
        description="Largest CLAP variant. Best quality but highest resource usage.",
        vram_gb=3.0,
        quality="最高",
        speed="较慢",
        embedding_dim=512,
    ),
    ModelInfo(
        key="encodec_6kbps",
        display_name="EnCodec (6 kbps)",
        description="Neural audio codec. Compact 128-dim latent codes, very fast.",
        vram_gb=0.8,
        quality="中高",
        speed="很快",
        embedding_dim=128,
    ),
]

StyleExtractModelKey = Literal[
    "clap_laion", "clap_msclap", "clap_htsat", "encodec_6kbps",
]


# === Music Generation Models ===

MUSIC_GEN_MODELS: list[ModelInfo] = [
    ModelInfo(
        key="musicgen_small",
        display_name="MusicGen (Small)",
        description="300M params. Fast generation with decent quality. Great for rapid iteration.",
        vram_gb=2.5,
        quality="良好",
        speed="很快",
    ),
    ModelInfo(
        key="musicgen_medium",
        display_name="MusicGen (Medium)",
        description="1.5B params. Balanced quality and speed. Recommended for RTX 5080.",
        vram_gb=5.0,
        quality="高",
        speed="中等",
    ),
    ModelInfo(
        key="musicgen_large",
        display_name="MusicGen (Large)",
        description="3.3B params. Best quality but heavy on VRAM. ~8GB at full load.",
        vram_gb=8.0,
        quality="最高",
        speed="较慢",
    ),
    ModelInfo(
        key="musicgen_melody",
        display_name="MusicGen (Melody)",
        description="1.5B melody-conditioned. Follows harmonic structure from reference audio.",
        vram_gb=5.5,
        quality="很高",
        speed="中等",
    ),
    ModelInfo(
        key="audioldm2",
        display_name="AudioLDM 2",
        description="Latent diffusion-based generation. Diverse outputs with good fidelity.",
        vram_gb=6.0,
        quality="高",
        speed="较慢",
    ),
]

MusicGenModelKey = Literal[
    "musicgen_small", "musicgen_medium", "musicgen_large",
    "musicgen_melody", "audioldm2",
]


# === Lookup helpers ===

_MODEL_MAP = {
    "vocal_sep": {m.key: m for m in VOCAL_SEP_MODELS},
    "style_extract": {m.key: m for m in STYLE_EXTRACT_MODELS},
    "music_gen": {m.key: m for m in MUSIC_GEN_MODELS},
}

_MODEL_LISTS = {
    "vocal_sep": VOCAL_SEP_MODELS,
    "style_extract": STYLE_EXTRACT_MODELS,
    "music_gen": MUSIC_GEN_MODELS,
}

CategoryKey = Literal["vocal_sep", "style_extract", "music_gen"]


def get_model_info(category: CategoryKey, key: str) -> ModelInfo | None:
    """Look up a single model by category and key."""
    return _MODEL_MAP.get(category, {}).get(key)


def list_models(category: CategoryKey) -> list[ModelInfo]:
    """Return all model options for a pipeline stage."""
    return _MODEL_LISTS.get(category, [])


def validate_model_key(category: CategoryKey, key: str) -> bool:
    """Check if a model key is valid for the given category."""
    return key in _MODEL_MAP.get(category, {})


def get_default_model(category: CategoryKey) -> str:
    """Return the default model key for a pipeline stage."""
    defaults = {"vocal_sep": "demucs_htdemucs", "style_extract": "clap_laion", "music_gen": "musicgen_small"}
    return defaults.get(category, "")
