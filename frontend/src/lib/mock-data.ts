/**
 * Demo/mock data for showcasing the UI without a running backend.
 * Activated when NEXT_PUBLIC_DEMO_MODE=true or when API is unreachable in dev.
 */
import type { AudioAsset, StyleTag, GeneratedMusic, VoiceModel, Song } from "@/types";

// ───────── Audio Assets ─────────

export const MOCK_ASSETS: AudioAsset[] = [
  {
    id: "demo-a1",
    fileName: "piano-improv-jazz.wav",
    filePath: "",
    status: "completed",
    vocalSepModel: "demucs_htdemucs",
    uploadedAt: "2026-05-25",
  },
  {
    id: "demo-a2",
    fileName: "guitar-solo-ambient.wav",
    filePath: "",
    status: "completed",
    vocalSepModel: "demucs_htdemucs",
    uploadedAt: "2026-05-24",
  },
  {
    id: "demo-a3",
    fileName: "vocal-female-ballad.wav",
    filePath: "",
    status: "completed",
    vocalSepModel: "demucs_6s",
    uploadedAt: "2026-05-23",
  },
  {
    id: "demo-a4",
    fileName: "electronic-beat-loop.wav",
    filePath: "",
    status: "completed",
    vocalSepModel: "demucs_htdemucs",
    uploadedAt: "2026-05-22",
  },
  {
    id: "demo-a5",
    fileName: "orchestral-strings.wav",
    filePath: "",
    status: "completed",
    vocalSepModel: "demucs_ft",
    uploadedAt: "2026-05-21",
  },
];

// ───────── Style Tags ─────────

export const MOCK_STYLES: StyleTag[] = [
  { id: "s1", name: "爵士钢琴", assetId: "demo-a1", embedding: [], styleExtractModel: "clap_laion", createdAt: "2026-05-25" },
  { id: "s2", name: "氛围电子", assetId: "demo-a2", embedding: [], styleExtractModel: "clap_laion", createdAt: "2026-05-24" },
  { id: "s3", name: "抒情女声", assetId: "demo-a3", embedding: [], styleExtractModel: "clap_laion", createdAt: "2026-05-23" },
  { id: "s4", name: "电子节拍", assetId: "demo-a4", embedding: [], styleExtractModel: "clap_laion", createdAt: "2026-05-22" },
  { id: "s5", name: "管弦乐", assetId: "demo-a5", embedding: [], styleExtractModel: "clap_laion", createdAt: "2026-05-21" },
];

// ───────── Playlist ─────────

export const MOCK_PLAYLIST: GeneratedMusic[] = [
  {
    id: "m1",
    title: "深夜 Lo-Fi 漫步",
    prompt: "适合深夜开车的 Lo-Fi 音乐，带有温暖的低保真质感",
    styleName: "爵士钢琴",
    filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    duration: 182,
    musicGenModel: "musicgen_small",
    providerMode: "mock",
    createdAt: "2026-05-25",
  },
  {
    id: "m2",
    title: "晨光氛围电子",
    prompt: "带有爵士钢琴元素的氛围电子乐，舒缓而有层次",
    styleName: "氛围电子",
    filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    duration: 153,
    musicGenModel: "musicgen_medium",
    providerMode: "mock",
    createdAt: "2026-05-24",
  },
  {
    id: "m3",
    title: "雨后城市漫步",
    prompt: "适合雨夜城市街道的电子音乐，带有霓虹灯般的合成器音色",
    styleName: "电子节拍",
    filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    duration: 201,
    musicGenModel: "musicgen_small",
    providerMode: "mock",
    createdAt: "2026-05-23",
  },
  {
    id: "m4",
    title: "午后咖啡馆",
    prompt: "慵懒的爵士风格咖啡馆背景音乐，适合放松阅读",
    styleName: "爵士钢琴",
    filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    duration: 168,
    musicGenModel: "musicgen_medium",
    providerMode: "mock",
    createdAt: "2026-05-22",
  },
  {
    id: "m5",
    title: "星空冥想",
    prompt: "适合冥想放松的大自然氛围音乐，空灵而宁静",
    styleName: "管弦乐",
    filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    duration: 215,
    musicGenModel: "musicgen_small",
    providerMode: "mock",
    createdAt: "2026-05-21",
  },
  {
    id: "m6",
    title: "夏日公路旅行",
    prompt: "节奏轻快的夏日流行音乐，适合公路旅行",
    styleName: "电子节拍",
    filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
    duration: 145,
    musicGenModel: "musicgen_small",
    providerMode: "mock",
    createdAt: "2026-05-20",
  },
];

// ───────── Voice Models ─────────

export const MOCK_VOICE_MODELS: VoiceModel[] = [
  {
    id: "v1",
    name: "温柔女声",
    sourceAudioIds: [1],
    status: "ready",
    epoch: 200,
    targetEpochs: 200,
    qualityTier: "premium",
    durationSeconds: 180,
    createdAt: "2026-05-18",
  },
  {
    id: "v2",
    name: "磁性男声",
    sourceAudioIds: [2],
    status: "ready",
    epoch: 100,
    targetEpochs: 100,
    qualityTier: "standard",
    durationSeconds: 240,
    createdAt: "2026-05-16",
  },
  {
    id: "v3",
    name: "清亮童声",
    sourceAudioIds: [3],
    status: "training",
    epoch: 45,
    targetEpochs: 200,
    qualityTier: "premium",
    durationSeconds: 120,
    createdAt: "2026-05-20",
  },
];

// ───────── Songs ─────────

export const MOCK_SONGS: Song[] = [
  {
    id: "sg1",
    theme: "月光下的思念",
    status: "completed",
    lyrics: "月色轻轻洒落窗台\n远方的你是否也在看\n风吹过树叶沙沙响\n像是你在我耳边呢喃",
    instrumentalPath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    vocalPath: "",
    mixedPath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    createdAt: "2026-05-25",
    hasVocals: true,
    providerMode: "mock",
  },
  {
    id: "sg2",
    theme: "夏日冒险",
    status: "completed",
    lyrics: "阳光洒满整条街道\n踩着单车去冒险\n风吹起你的发梢\n笑声在空气中飘散",
    instrumentalPath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    vocalPath: "",
    mixedPath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    createdAt: "2026-05-24",
    hasVocals: true,
    providerMode: "mock",
  },
  {
    id: "sg3",
    theme: "星空下的约定",
    status: "mixing",
    lyrics: "夜空中的星星闪烁\n像是我们许下的约定\n不管未来多遥远\n这一刻永远留在心底",
    instrumentalPath: "",
    vocalPath: "",
    mixedPath: "",
    createdAt: "2026-05-26",
    hasVocals: true,
    providerMode: "mock",
  },
];

// ───────── Suggestions ─────────

export const MOCK_SUGGESTIONS = [
  "一首适合深夜开车的 Lo-Fi 音乐",
  "带有爵士钢琴元素的氛围电子乐",
  "节奏轻快的夏日流行音乐",
  "适合冥想放松的大自然白噪音",
  "融合东方元素的电子音乐",
  "复古合成器风格的 Synthwave",
  "温暖治愈的指弹吉他曲",
  "电影感史诗管弦配乐",
];

// ───────── Demo mode check ─────────

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  const setting = process.env.NEXT_PUBLIC_DEMO_MODE;
  if (setting === "true") return true;
  if (setting === "false") return false;
  // In development without explicit setting, demo mode is on (no backend expected)
  return process.env.NODE_ENV !== "production";
}
