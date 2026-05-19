"use client";

import { useState, useRef, useCallback } from "react";
import { Play, Pause, VinylRecord } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import type { GeneratedMusic } from "@/types";

const COVER_GRADIENTS = [
  "linear-gradient(135deg, #2a1a08 0%, #4a3020 50%, #1a1410 100%)",
  "linear-gradient(135deg, #1a2a20 0%, #204a3a 50%, #101a14 100%)",
  "linear-gradient(135deg, #201a2a 0%, #3a284a 50%, #14101a 100%)",
  "linear-gradient(135deg, #2a2010 0%, #4a4020 50%, #1a1810 100%)",
  "linear-gradient(135deg, #1a1a2a 0%, #2a3050 50%, #10141a 100%)",
  "linear-gradient(135deg, #2a1018 0%, #4a2030 50%, #1a1014 100%)",
];

const FEATURED_TRACKS: GeneratedMusic[] = [
  { id: "f1", title: "深夜 Lo-Fi 漫步", prompt: "适合深夜开车的 Lo-Fi 音乐", styleName: "Lo-Fi 电音", filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", duration: 182, createdAt: "2026-05-19" },
  { id: "f2", title: "晨光氛围电子", prompt: "带有爵士钢琴元素的氛围电子乐", styleName: "爵士氛围", filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", duration: 153, createdAt: "2026-05-18" },
  { id: "f3", title: "雨后城市漫步", prompt: "适合雨夜城市街道的电子音乐", styleName: "电子氛围", filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", duration: 201, createdAt: "2026-05-17" },
  { id: "f4", title: "午后咖啡馆", prompt: "慵懒的爵士风格咖啡馆背景音乐", styleName: "爵士钢琴", filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", duration: 168, createdAt: "2026-05-16" },
  { id: "f5", title: "星空冥想", prompt: "适合冥想放松的大自然氛围音乐", styleName: "自然白噪", filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", duration: 215, createdAt: "2026-05-15" },
  { id: "f6", title: "夏日公路旅行", prompt: "节奏轻快的夏日流行音乐", styleName: "流行轻快", filePath: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3", duration: 145, createdAt: "2026-05-14" },
];

export default function FeaturedTracks() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = useCallback((track: GeneratedMusic) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    try {
      const a = new Audio(track.filePath);
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
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); }}
            className="text-xs tracking-wider"
            style={{ color: "var(--text-tertiary)", fontFamily: "'JetBrains Mono', monospace" }}
          >
            查看全部 &rarr;
          </a>
        </div>

        {/* Track grid with cover-art cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURED_TRACKS.map((track, i) => {
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
                        : <Play size={22} weight="fill" style={{ color: "#fff" }} />}
                    </motion.div>
                  </div>

                  {/* Playing EQ bars overlay */}
                  {isPlaying && (
                    <div className="absolute bottom-4 left-4 right-4 flex items-end justify-center gap-[1px] h-8">
                      {Array.from({ length: 24 }).map((_, j) => (
                        <div key={j} className="flex-1 rounded-full"
                          style={{
                            height: `${4 + Math.random() * 28}px`,
                            background: "var(--accent)",
                            animation: `eq-pulse ${0.3 + Math.random() * 0.5}s ease-in-out ${Math.random() * 0.3}s infinite`,
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
