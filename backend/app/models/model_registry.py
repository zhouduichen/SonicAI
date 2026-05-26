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
    pros: list[str] | None = None
    cons: list[str] | None = None


# === Vocal Separation Models ===

VOCAL_SEP_MODELS: list[ModelInfo] = [
    ModelInfo(
        key="demucs_htdemucs",
        display_name="Demucs (htdemucs)",
        description="Hybrid transformer 6-source separation. Best quality overall.",
        vram_gb=6.5,
        quality="最高",
        speed="较慢",
        pros=["业界最佳分离品质", "支持人声/鼓/贝斯/其他四轨分离", "对中文歌曲优化良好"],
        cons=["处理速度较慢，单曲约 2-3 分钟", "需要 6.5GB+ VRAM", "CPU 模式几乎不可用"],
    ),
    ModelInfo(
        key="demucs_mdx_extra",
        display_name="Demucs (MDX Extra)",
        description="MDX-trained variant with extra data. Excellent vocal isolation.",
        vram_gb=5.0,
        quality="很高",
        speed="中等",
        pros=["优秀的人声隔离效果", "品质与速度均衡", "VRAM 需求适中"],
        cons=["不分离鼓组轨道", "极端嘈杂环境下表现下降"],
    ),
    ModelInfo(
        key="demucs_6s",
        display_name="Demucs (6-Source)",
        description="Full 6-source: vocals, drums, bass, other, piano, guitar.",
        vram_gb=4.5,
        quality="高",
        speed="中等",
        pros=["6 轨完整分离", "适合多轨混音需求", "VRAM 需求适中"],
        cons=["分离速度较 MDX 慢", "钢琴/吉他分离精度有限"],
    ),
    ModelInfo(
        key="spleeter_2stems",
        display_name="Spleeter (2-stem)",
        description="Fast 2-stem separation. Great speed/quality balance for development.",
        vram_gb=1.5,
        quality="中",
        speed="很快",
        pros=["极速处理，秒级完成", "CPU 可流畅运行", "资源占用极低"],
        cons=["分离精度低于 Demucs", "仅支持人声/伴奏双轨"],
    ),
    ModelInfo(
        key="spleeter_5stems",
        display_name="Spleeter (5-stem)",
        description="5-stem separation. Useful for multi-track extraction.",
        vram_gb=2.0,
        quality="中高",
        speed="快",
        pros=["5 轨多乐器分离", "速度与品质平衡", "CPU 可运行"],
        cons=["分离精度不如 Demucs", "不支持中文歌曲特化"],
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
        pros=["通用音乐理解能力最强", "512 维高维度风格嵌入", "支持中英文描述匹配", "VRAM 需求低 (1.2GB)"],
        cons=["对细分电子流派区分度有限"],
    ),
    ModelInfo(
        key="clap_msclap",
        display_name="CLAP (MS-CLAP)",
        description="Microsoft CLAP fine-tuned on diverse music. Better genre discrimination.",
        vram_gb=1.5,
        quality="很高",
        speed="中等",
        embedding_dim=1024,
        pros=["1024 维更丰富嵌入", "流行/摇滚音乐分析精准", "流派判别力更强"],
        cons=["推理速度略慢于 LAION 版", "VRAM 需求稍高"],
    ),
    ModelInfo(
        key="clap_htsat",
        display_name="CLAP (HTSAT-Huge)",
        description="Largest CLAP variant. Best quality but highest resource usage.",
        vram_gb=3.0,
        quality="最高",
        speed="较慢",
        embedding_dim=512,
        pros=["最高品质音频理解", "对复杂音乐结构感知强", "512 维高质量嵌入"],
        cons=["VRAM 需求较高 (3GB)", "加载和推理速度较慢"],
    ),
    ModelInfo(
        key="encodec_6kbps",
        display_name="EnCodec (6 kbps)",
        description="Neural audio codec. Compact 128-dim latent codes, very fast.",
        vram_gb=0.8,
        quality="中高",
        speed="很快",
        embedding_dim=128,
        pros=["极速提取，秒级完成", "VRAM 极低 (0.8GB)", "CPU 友好，适合低配设备"],
        cons=["嵌入维度低 (128D)", "风格细节捕捉有限", "风格迁移效果一般"],
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
        pros=["生成速度最快，约 30 秒/曲", "低 VRAM 友好 (2.5GB)", "适合快速灵感迭代"],
        cons=["音质细节不足", "复杂提示理解有限", "低频丰满度不足"],
    ),
    ModelInfo(
        key="musicgen_medium",
        display_name="MusicGen (Medium)",
        description="1.5B params. Balanced quality and speed. Recommended for RTX 5080.",
        vram_gb=5.0,
        quality="高",
        speed="中等",
        pros=["音质与速度均衡", "风格跟随准确度高", "VRAM 需求适中 (5GB)"],
        cons=["长曲目 (>2min) 结构松散", "极端风格组合可能退化"],
    ),
    ModelInfo(
        key="musicgen_large",
        display_name="MusicGen (Large)",
        description="3.3B params. Best quality but heavy on VRAM. ~8GB at full load.",
        vram_gb=8.0,
        quality="最高",
        speed="较慢",
        pros=["最高音质输出，接近专业水准", "复杂音乐结构理解力强", "多风格/多乐器融合自然"],
        cons=["生成速度较慢，单曲约 3-5 分钟", "需要 8GB+ VRAM", "不支持实时预览"],
    ),
    ModelInfo(
        key="musicgen_melody",
        display_name="MusicGen (Melody)",
        description="1.5B melody-conditioned. Follows harmonic structure from reference audio.",
        vram_gb=5.5,
        quality="很高",
        speed="中等",
        pros=["跟随参考音频和声结构", "旋律连贯性更好", "适合有明确旋律参考的创作"],
        cons=["需要参考音频输入", "VRAM 需求较 Medium 略高"],
    ),
    ModelInfo(
        key="audioldm2",
        display_name="AudioLDM 2",
        description="Latent diffusion-based generation. Diverse outputs with good fidelity.",
        vram_gb=6.0,
        quality="高",
        speed="较慢",
        pros=["文本语义理解力最强", "创意/实验风格多样", "支持音效与环境声生成"],
        cons=["音质一致性不稳定", "生成时间较长 (2-4 分钟)", "对音乐结构把控较弱"],
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
    defaults = {"vocal_sep": "demucs_htdemucs", "style_extract": "encodec_6kbps", "music_gen": "musicgen_small"}
    return defaults.get(category, "")
