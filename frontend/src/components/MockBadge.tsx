"use client";

import { Info } from "@phosphor-icons/react";
import type { GeneratedMusic } from "@/types";

interface MockBadgeProps {
  music: GeneratedMusic;
  /** Show compact variant (for list items) vs full (for player) */
  variant?: "compact" | "full";
}

export default function MockBadge({ music, variant = "compact" }: MockBadgeProps) {
  return (
    <span className="group relative inline-flex">
      <span
        className="text-[8px] font-mono tracking-wider px-1 py-0.5 rounded shrink-0 cursor-help"
        style={{
          background: "rgba(255, 170, 0, 0.15)",
          color: "#ffaa00",
          border: "1px solid rgba(255, 170, 0, 0.3)",
        }}
      >
        {variant === "full" ? "模拟模式" : "模拟"}
      </span>

      {/* Tooltip */}
      <span
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
                   opacity-0 group-hover:opacity-100 transition-opacity duration-200
                   pointer-events-none whitespace-nowrap"
      >
        <span
          className="block px-3 py-2 rounded-lg text-[10px] leading-relaxed shadow-xl"
          style={{
            background: "#1a1a1a",
            border: "1px solid rgba(255,170,0,0.25)",
            color: "#e0e0e0",
            minWidth: 160,
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5 pb-1.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <Info size={10} weight="fill" style={{ color: "#ffaa00" }} />
            <span style={{ color: "#ffaa00", fontWeight: 600 }}>模拟数据</span>
          </div>
          <div className="space-y-1">
            {music.musicGenModel && (
              <div className="flex justify-between gap-4">
                <span style={{ color: "#888" }}>模型</span>
                <span style={{ color: "#ccc" }}>{music.musicGenModel}</span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span style={{ color: "#888" }}>模式</span>
              <span style={{ color: "#ccc" }}>{music.providerMode === "mock" ? "模拟 (Mock)" : "真实 (Real)"}</span>
            </div>
            {music.duration > 0 && (
              <div className="flex justify-between gap-4">
                <span style={{ color: "#888" }}>时长</span>
                <span style={{ color: "#ccc" }}>{Math.floor(music.duration / 60)}:{String(music.duration % 60).padStart(2, "0")}</span>
              </div>
            )}
            <div className="pt-1.5 mt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ color: "#666", fontSize: 9 }}>
                未检测到 GPU 或模型未正确加载时自动降级
              </span>
            </div>
          </div>
        </span>
        {/* Arrow */}
        <span
          className="block absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
          style={{ background: "#1a1a1a", borderRight: "1px solid rgba(255,170,0,0.25)", borderBottom: "1px solid rgba(255,170,0,0.25)" }}
        />
      </span>
    </span>
  );
}
