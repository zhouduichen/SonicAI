"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Pause } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import Link from "next/link";
import type { GeneratedMusic } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

const COVER_GRADIENTS = [
  "linear-gradient(135deg, #2a1d10 0%, #4a3828 50%, #1a1410 100%)",
  "linear-gradient(135deg, #12241a 0%, #1e3d30 50%, #0e1612 100%)",
  "linear-gradient(135deg, #1a1526 0%, #2e2240 50%, #110e18 100%)",
  "linear-gradient(135deg, #262010 0%, #3d3820 50%, #161410 100%)",
  "linear-gradient(135deg, #141a28 0%, #202a40 50%, #0e1218 100%)",
  "linear-gradient(135deg, #241018 0%, #3a2030 50%, #160e12 100%)",
];

function seededUnit(seed: number) {
  let value = (seed + 0x6d2b79f5) | 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

const EQ_BARS = Array.from({ length: 24 }, (_, i) => ({
  height: `${(4 + seededUnit(i + 1) * 28).toFixed(2)}px`,
  duration: `${(0.3 + seededUnit(i + 101) * 0.5).toFixed(2)}s`,
  delay: `${(seededUnit(i + 201) * 0.3).toFixed(2)}s`,
}));

const SOUNDHELIX_FALLBACKS: GeneratedMusic[] = [
  { id: "f1", title: "深夜 Lo-Fi 漫步", prompt: "适合深夜开车的 Lo-Fi 音乐", styleName: "Lo-Fi 电音", filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", duration: 182, createdAt: "2026-05-19" },
  { id: "f2", title: "晨光氛围电子", prompt: "带有爵士钢琴元素的氛围电子乐", styleName: "爵士氛围", filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", duration: 153, createdAt: "2026-05-18" },
  { id: "f3", title: "雨后城市漫步", prompt: "适合雨夜城市街道的电子音乐", styleName: "电子氛围", filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", duration: 201, createdAt: "2026-05-17" },
  { id: "f4", title: "午后咖啡馆", prompt: "慵懒的爵士风格咖啡馆背景音乐", styleName: "爵士钢琴", filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", duration: 168, createdAt: "2026-05-16" },
  { id: "f5", title: "星空冥想", prompt: "适合冥想放松的大自然氛围音乐", styleName: "自然白噪", filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", duration: 215, createdAt: "2026-05-15" },
  { id: "f6", title: "夏日公路旅行", prompt: "节奏轻快的夏日流行音乐", styleName: "流行轻快", filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3", duration: 145, createdAt: "2026-05-14" },
];

function resolveAudioUrl(track: GeneratedMusic): string {
  const fp = track.filePath;
  if (!fp) return "";
  if (fp.startsWith("http://") || fp.startsWith("https://") || fp.startsWith("blob:")) return fp;
  return `${API_BASE}/music/public/${track.id}/download`;
}

async function fetchFeaturedTracks(): Promise<GeneratedMusic[]> {
  try {
    const res = await fetch(`${API_BASE}/music/public/featured?limit=6`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return [];
    return data.map((item: {
      id: number; title: string; prompt: string; style_name: string;
      file_path: string; duration_seconds: number; music_gen_model: string; created_at: string;
    }) => ({
      id: String(item.id),
      title: item.title,
      prompt: item.prompt,
      styleName: item.style_name,
      filePath: item.file_path,
      duration: item.duration_seconds,
      musicGenModel: item.music_gen_model,
      createdAt: item.created_at?.split("T")[0] || "",
    }));
  } catch {
    return [];
  }
}

export default function FeaturedTracks() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<GeneratedMusic[]>(SOUNDHELIX_FALLBACKS);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFeaturedTracks().then((data) => {
      if (!cancelled && data.length > 0) setTracks(data);
    });
    return () => { cancelled = true; };
  }, []);

  const togglePlay = useCallback((track: GeneratedMusic) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    try {
      const a = new Audio(resolveAudioUrl(track));
      a.play().catch(() => {});
      a.onended = () => { setPlayingId(null); audioRef.current = null; };
      audioRef.current = a;
      setPlayingId(track.id);
    } catch {
      // Audio not available, silently ignore
    }
  }, [playingId]);

  return (
    <section id="featured-tracks" className="relative py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-12">
          <div>
            <span className="eyebrow mb-3 inline-block">DISCOVER</span>
            <h2 className="text-3xl md:text-4xl italic font-medium"
              style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
              精选 AI 音乐
            </h2>
          </div>
          <Link
            href="/create"
            className="text-xs tracking-wider transition-colors hover:opacity-80"
            style={{ color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}
          >
            查看全部 &rarr;
          </Link>
        </div>

        {/* Track grid with cover-art cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tracks.map((track, i) => {
            const isPlaying = playingId === track.id;
            return (
              <motion.div
                key={track.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.06, duration: 0.45 }}
                className="group cursor-pointer"
                onClick={() => togglePlay(track)}
              >
                {/* Cover art with edge light */}
                <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 group-hover:shadow-[0_0_40px_rgba(212,168,83,0.1)] transition-shadow duration-500"
                  style={{ background: COVER_GRADIENTS[i % COVER_GRADIENTS.length] }}>
                  {/* Top edge light catch */}
                  <div className="absolute top-0 left-0 right-0 h-1/3 rounded-t-2xl pointer-events-none"
                    style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.04), transparent)" }} />
                  {/* Vinyl record decoration */}
                  <div className="absolute inset-4 rounded-full border opacity-20"
                    style={{ borderColor: "rgba(255,255,255,0.15)" }} />
                  <div className="absolute inset-[30%] rounded-full opacity-30"
                    style={{ background: "radial-gradient(circle, rgba(255,255,255,0.08), transparent)" }} />

                  {/* Center play button */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      className="w-14 h-14 rounded-full flex items-center justify-center"
                      style={{
                        background: isPlaying ? "var(--accent)" : "rgba(0,0,0,0.5)",
                        backdropFilter: "blur(8px)",
                        border: "1px solid rgba(255,255,255,0.15)",
                      }}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {isPlaying
                        ? <Pause size={22} weight="fill" style={{ color: "#0d0d0d" }} />
                        : <Play size={22} weight="fill" style={{ color: "#f2f2f2" }} />}
                    </motion.div>
                  </div>

                  {/* Playing EQ bars overlay */}
                  {isPlaying && (
                    <div className="absolute bottom-4 left-4 right-4 flex items-end justify-center gap-[1px] h-8">
                      {EQ_BARS.map((bar, j) => (
                        <div key={j} className="flex-1 rounded-full"
                          style={{
                            height: bar.height,
                            background: "var(--accent)",
                            animation: `eq-pulse ${bar.duration} ease-in-out ${bar.delay} infinite`,
                          }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Track info */}
                <div className="px-1">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {track.title}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
                      {track.styleName}
                    </p>
                    <span className="text-[10px] font-mono tracking-wider ml-2 shrink-0" style={{ color: "var(--text-tertiary)" }}>
                      {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, "0")}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
