"use client";

import { Trash, Play, Plus, Disc, Waveform, Clock, CheckCircle, MagnifyingGlass } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import type { StyleTag } from "@/types";

interface StyleLibraryProps {
  styles: StyleTag[];
  onSelect: (style: StyleTag) => void;
  onDelete: (id: string) => void;
  selectedId?: string;
}

export default function StyleLibrary({ styles, onSelect, onDelete, selectedId }: StyleLibraryProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return styles;
    return styles.filter((s) => {
      const name = s.name.toLowerCase();
      const source = ((s as any).source_audio_name || "").toLowerCase();
      const model = ((s as any).model || "").toLowerCase();
      return name.includes(q) || source.includes(q) || model.includes(q);
    });
  }, [styles, search]);

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
            <div className="w-7 h-7 rotate-45 flex items-center justify-center"
              style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 6 }}>
              <Disc size={12} weight="fill" className="-rotate-45" style={{ color: "var(--accent)" }} />
            </div>
            <h3 className="text-lg italic font-medium"
              style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
              风格标签
            </h3>
          </div>
          <span className="text-[10px] font-mono tracking-[0.15em]"
            style={{ color: "var(--text-tertiary)" }}>
            {filtered.length}/{styles.length} 个风格
          </span>
        </div>

        {/* Search input */}
        {styles.length > 0 && (
          <div className="relative">
            <MagnifyingGlass size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-tertiary)" }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索风格名称、来源或模型..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg transition-colors"
              style={{
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
                outline: "none",
              }}
              onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--border-color)"; }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] px-1.5 py-0.5 rounded"
                style={{ color: "var(--text-tertiary)" }}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="py-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rotate-45 flex items-center justify-center"
              style={{ border: "1.5px dashed var(--border-color)" }}>
              <Plus size={18} className="-rotate-45" style={{ color: "var(--text-tertiary)" }} />
            </div>
            <p className="text-sm italic" style={{ color: "var(--text-secondary)", fontFamily: "'Playfair Display', serif" }}>
              {search ? "没有匹配的风格" : "暂无风格标签"}
            </p>
            <p className="text-xs mt-1 font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              {search ? "尝试其他搜索词" : "上传音频后自动提取音乐风格"}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence>
              {filtered.map((style) => {
                const active = selectedId === style.id;
                const sourceName = (style as any).source_audio_name || "";
                const modelName = (style as any).model || "";
                const createdAt = (style as any).created_at || "";
                const dimCount = style.embedding.length;

                return (
                  <motion.div
                    key={style.id}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.25 }}
                    onClick={() => onSelect(style)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(style); } }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    className="group flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-300"
                    style={{
                      background: active ? "var(--accent-soft)" : "transparent",
                      border: active ? "1px solid var(--accent)" : "1px solid transparent",
                      borderRadius: 8,
                    }}
                  >
                    <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
                      <div className="absolute inset-0 rounded-full"
                        style={{
                          background: active ? "var(--accent-soft)" : "var(--bg-tertiary)",
                          border: active ? "1.5px solid var(--accent)" : "1px solid var(--border-color)",
                        }} />
                      <Waveform size={14} weight={active ? "fill" : "regular"}
                        style={{ color: active ? "var(--accent)" : "var(--text-tertiary)" }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate"
                          style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}>
                          {style.name}
                        </p>
                        {active && (
                          <CheckCircle size={12} weight="fill" style={{ color: "var(--accent)", flexShrink: 0 }} />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="style-detail-tag">{dimCount}维</span>
                        {sourceName && (
                          <span className="style-detail-tag">
                            <Waveform size={7} /> {sourceName.slice(0, 14)}
                          </span>
                        )}
                        {modelName && (
                          <span className="style-detail-tag">{modelName.slice(0, 12)}</span>
                        )}
                        {createdAt && (
                          <span className="style-detail-tag">
                            <Clock size={7} /> {createdAt.slice(0, 10)}
                          </span>
                        )}
                      </div>
                    </div>

                    {active && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: "var(--accent)", color: "#0d0d0d" }}>
                        创作中
                      </span>
                    )}

                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(style.id); }}
                      className="p-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-full"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      <Trash size={14} />
                    </button>
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
