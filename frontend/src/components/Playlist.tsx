"use client";

import { Play, Pause, MusicNotes } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import type { GeneratedMusic } from "@/types";

interface PlaylistProps {
  items: GeneratedMusic[];
  currentPlayingId?: string | null;
  onPlay: (music: GeneratedMusic) => void;
}

export default function Playlist({ items, currentPlayingId, onPlay }: PlaylistProps) {
  return (
    <div className="card-outer">
      <div className="card-inner p-6 space-y-5 relative overflow-hidden">
        {/* Top deco */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, var(--accent), transparent)" }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ background: "var(--accent)", opacity: 0.4 }} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="eyebrow">作品</span>
            <h3 className="text-lg italic font-medium"
              style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
              音乐存档
            </h3>
          </div>
          <span className="text-[10px] font-mono tracking-[0.15em]"
            style={{ color: "var(--text-tertiary)" }}>
            {items.length} 首曲目
          </span>
        </div>

        {items.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ border: "1.5px dashed var(--border-color)" }}>
              <MusicNotes size={22} weight="regular" style={{ color: "var(--text-tertiary)" }} />
            </div>
            <p className="text-sm italic" style={{ color: "var(--text-secondary)", fontFamily: "'Playfair Display', serif" }}>
              还没有生成音乐
            </p>
            <p className="text-xs mt-1 font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              上传音频 + 输入描述 + 点击生成
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence>
              {items.map((item) => {
                const active = currentPlayingId === item.id;
                return (
                  <motion.div
                    key={item.id}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    onClick={() => onPlay(item)}
                    className="group flex items-center gap-4 px-4 py-3 cursor-pointer transition-all duration-300"
                    style={{
                      background: active ? "var(--accent-soft)" : "transparent",
                      borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                      borderRadius: 8,
                    }}
                  >
                    <div className="w-7 h-7 flex items-center justify-center shrink-0"
                      style={{ color: active ? "var(--accent)" : "var(--text-tertiary)" }}>
                      {active
                        ? <Pause size={16} weight="fill" />
                        : <Play size={16} weight="regular" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate"
                        style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}>
                        {item.title}
                      </p>
                      <p className="text-[10px] font-mono tracking-[0.06em] uppercase truncate"
                        style={{ color: "var(--text-tertiary)" }}>
                        {item.styleName} &middot; {item.prompt.slice(0, 30)}
                      </p>
                    </div>

                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-[10px] font-mono tracking-wider"
                        style={{ color: "var(--text-tertiary)" }}>
                        {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, "0")}
                      </p>
                    </div>

                    <div className="w-1.5 h-1.5 rotate-45 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: "var(--accent)" }} />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Bottom deco */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to left, var(--accent), transparent)" }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ background: "var(--accent)", opacity: 0.4 }} />
        </div>
      </div>
    </div>
  );
}
