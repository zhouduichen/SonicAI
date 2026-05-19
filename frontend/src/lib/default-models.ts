import type { ModelCatalog, ModelInfo } from "@/types";

export const DEFAULT_VOCAL_SEPARATION_MODELS: ModelInfo[] = [
  {
    key: "demucs_htdemucs",
    display_name: "Demucs HT",
    description: "Meta 开源的高精度人声分离模型，基于混合 Transformer 架构，支持四轨分离",
    vram_gb: 6,
    quality: "最高品质",
    speed: "较慢",
    pros: ["业界最佳分离质量", "支持人声/鼓/贝斯/其他四轨分离", "对中文歌曲优化良好"],
    cons: ["处理速度较慢，单曲约 2-3 分钟", "需要 6GB+ VRAM", "CPU 模式几乎不可用"],
  },
  {
    key: "demucs_fine",
    display_name: "Demucs Fine",
    description: "Demucs 轻量微调版本，在质量与速度之间取得平衡",
    vram_gb: 4,
    quality: "高品质",
    speed: "中等",
    pros: ["质量与速度均衡", "适合大部分流行素材", "VRAM 需求适中"],
    cons: ["不分离鼓组轨道", "极端嘈杂环境下表现下降"],
  },
  {
    key: "spleeter",
    display_name: "Spleeter",
    description: "Deezer 开源的快速人声分离工具，基于 U-Net 架构，CPU 友好",
    vram_gb: 2,
    quality: "良好",
    speed: "快速",
    pros: ["极速处理，秒级完成", "CPU 可流畅运行", "资源占用极低"],
    cons: ["分离精度低于 Demucs", "不支持中文歌曲特化", "仅支持人声/伴奏双轨"],
  },
];

export const DEFAULT_STYLE_EXTRACTION_MODELS: ModelInfo[] = [
  {
    key: "clap_laion",
    display_name: "CLAP LAION",
    description: "LAION 社区训练的对比语言-音频预训练模型，通用音乐理解力强",
    vram_gb: 4,
    quality: "高精度",
    speed: "中等",
    embedding_dim: 512,
    pros: ["通用音乐理解能力最强", "512 维高维度风格嵌入", "支持中英文描述匹配"],
    cons: ["对细分电子流派区分度有限", "需要 GPU 加速", "首次加载较慢"],
  },
  {
    key: "clap_msd",
    display_name: "CLAP MSD",
    description: "在 Million Song Dataset 上微调的 CLAP 变体，对流行音乐分析更精准",
    vram_gb: 3,
    quality: "高精度",
    speed: "较快",
    embedding_dim: 512,
    pros: ["流行/摇滚音乐分析精准", "512 维丰富嵌入", "推理速度较快"],
    cons: ["对非西方音乐泛化较弱", "古典/爵士识别一般"],
  },
  {
    key: "wav2clip",
    display_name: "Wav2CLIP",
    description: "轻量级音频-图像联合嵌入模型，资源友好，适合快速原型",
    vram_gb: 1,
    quality: "良好",
    speed: "快速",
    embedding_dim: 128,
    pros: ["轻量快速，秒级提取", "CPU 可流畅运行", "适合快速迭代体验"],
    cons: ["嵌入维度较低 (128D)", "细节捕捉有限", "风格迁移效果一般"],
  },
];

export const DEFAULT_MUSIC_GENERATION_MODELS: ModelInfo[] = [
  {
    key: "musicgen_large",
    display_name: "MusicGen Large",
    description: "Meta 开源的最强音乐生成模型，3.3B 参数，输出质量接近专业制作",
    vram_gb: 12,
    quality: "录音室级",
    speed: "慢",
    pros: ["最高音质输出，接近专业水准", "复杂音乐结构理解力强", "多风格/多乐器融合自然"],
    cons: ["生成速度最慢，单曲约 3-5 分钟", "需要 12GB+ VRAM", "不支持实时预览"],
  },
  {
    key: "musicgen_medium",
    display_name: "MusicGen Medium",
    description: "MusicGen 中号版本，1.5B 参数，在质量与速度间取得最佳平衡",
    vram_gb: 6,
    quality: "高保真",
    speed: "中等",
    pros: ["音质与速度均衡", "风格跟随准确度高", "VRAM 需求适中 (6GB)"],
    cons: ["长曲目 (>2min) 结构松散", "极端风格组合可能退化"],
  },
  {
    key: "musicgen_small",
    display_name: "MusicGen Small",
    description: "MusicGen 轻量版，300M 参数，极速生成，适合快速灵感捕捉",
    vram_gb: 2,
    quality: "良好",
    speed: "快速",
    pros: ["生成速度最快，约 30 秒/曲", "低 VRAM 友好 (2GB)", "适合快速灵感迭代"],
    cons: ["音质细节不足", "复杂提示理解有限", "低频丰满度不足"],
  },
  {
    key: "audioldm",
    display_name: "AudioLDM",
    description: "基于潜在扩散的音频生成模型，文本理解力突出，创意风格多样",
    vram_gb: 8,
    quality: "高保真",
    speed: "较慢",
    pros: ["文本语义理解力最强", "创意/实验风格多样", "支持音效与环境声生成"],
    cons: ["音质一致性不稳定", "生成时间较长 (2-4 分钟)", "对音乐结构把控较弱"],
  },
];

export const DEFAULT_MODEL_CATALOG: ModelCatalog = {
  vocal_separation: DEFAULT_VOCAL_SEPARATION_MODELS,
  style_extraction: DEFAULT_STYLE_EXTRACTION_MODELS,
  music_generation: DEFAULT_MUSIC_GENERATION_MODELS,
};
