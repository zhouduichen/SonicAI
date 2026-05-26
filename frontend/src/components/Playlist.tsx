"use client";

import { useState, useMemo } from "react";
import { Play, Pause, MusicNotes, ArrowClockwise, Funnel, FunnelSimple, MagnifyingGlass, Repeat } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import type { GeneratedMusic } from "@/types";
import MockBadge from "./MockBadge";

interface PlaylistProps {
  items: GeneratedMusic[];
  currentPlayingId?: string | null;
  onPlay: (music: GeneratedMusic) => void;
  onRegenerate?: (music: GeneratedMusic) => void;
}

export default function Playlist({ items, currentPlayingId, onPlay, onRegenerate }: PlaylistProps) {
  const [search, setSearch] = useState("");
  const [filterModel, setFilterModel] = useState<string>("");
  const [filterStyle, setFilterStyle] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  // Derive unique filter options from items
  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((m) => { if (m.musicGenModel) set.add(m.musicGenModel); });
    return Array.from(set).sort();
  }, [items]);

  const styleOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((m) => set.add(m.styleName));
    return Array.from(set).sort();
  }, [items]);

  // Apply filters
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((m) => {
      if (q && !m.prompt.toLowerCase().includes(q) && !m.title.toLowerCase().includes(q)) return false;
      if (filterModel && m.musicGenModel !== filterModel) return false;
      if (filterStyle && m.styleName !== filterStyle) return false;
      return true;
    });
  }, [items, search, filterModel, filterStyle]);

  const hasFilters = search || filterModel || filterStyle;

  return (
    <div className="card-outer">
      <div className="card-inner p-6 space-y-5 relative overflow-hidden">
        {/* Top deco */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, var(--accent), transparent)" }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ background: "var(--accent)", opacity: 0.4 }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="eyebrow">作品</span>
            <h3 className="text-lg italic font-medium"
              style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
              音乐存档
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors text-[10px] font-mono"
                style={{
                  color: showFilters || hasFilters ? "var(--accent)" : "var(--text-tertiary)",
                  background: showFilters || hasFilters ? "var(--accent-soft)" : "transparent",
                }}
              >
                {hasFilters ? <Funnel size={10} weight="fill" /> : <FunnelSimple size={10} />}
                {hasFilters ? "已筛选" : "筛选"}
              </button>
            )}
            <span className="text-[10px] font-mono tracking-[0.15em]"
              style={{ color: "var(--text-tertiary)" }}>
              {filtered.length}/{items.length} 首曲目
            </span>
          </div>
        </div>

        {/* Filters bar */}
        <AnimatePresence>
          {(showFilters || hasFilters) && items.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap items-center gap-2 overflow-hidden"
            >
              {/* Search */}
              <div className="relative flex-1 min-w-[140px]">
                <MagnifyingGlass size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-tertiary)" }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索描述或标题..."
                  className="w-full pl-7 pr-2 py-1.5 text-[10px] rounded-lg"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                    outline: "none",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--border-color)"; }}
                />
              </div>

              {/* Model filter */}
              {modelOptions.length > 1 && (
                <select
                  value={filterModel}
                  onChange={(e) => setFilterModel(e.target.value)}
                  className="text-[10px] px-2 py-1.5 rounded-lg"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                    outline: "none",
                  }}
                >
                  <option value="">全部模型</option>
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}

              {/* Style filter */}
              {styleOptions.length > 1 && (
                <select
                  value={filterStyle}
                  onChange={(e) => setFilterStyle(e.target.value)}
                  className="text-[10px] px-2 py-1.5 rounded-lg"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                    outline: "none",
                  }}
                >
                  <option value="">全部风格</option>
                  {styleOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}

              {/* Clear filters */}
              {hasFilters && (
                <button
                  onClick={() => { setSearch(""); setFilterModel(""); setFilterStyle(""); }}
                  className="text-[9px] font-mono px-2 py-1 rounded-lg transition-colors"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  清除
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

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
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm italic" style={{ color: "var(--text-secondary)", fontFamily: "'Playfair Display', serif" }}>
              没有匹配的曲目
            </p>
            <p className="text-xs mt-1 font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              尝试调整筛选条件
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence>
              {filtered.map((item) => {
                const active = currentPlayingId === item.id;
                return (
                  <motion.div
                    key={item.id}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    onClick={() => onPlay(item)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPlay(item); } }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    className="group flex items-center gap-4 px-4 py-3 cursor-pointer transition-all duration-300"
                    style={{
                      background: active ? "var(--accent-soft)" : "transparent",
                      border: active ? "1px solid var(--accent)" : "1px solid transparent",
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
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate"
                          style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}>
                          {item.title}
                        </p>
                        {item.providerMode === "mock" && (
                          <MockBadge music={item} variant="compact" />
                        )}
                        {item.musicGenModel && (
                          <span className="text-[7px] font-mono px-1 py-0.5 rounded opacity-60 hidden sm:inline"
                            style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}>
                            {item.musicGenModel}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono tracking-[0.06em] uppercase truncate"
                        style={{ color: "var(--text-tertiary)" }}>
                        {item.styleName} &middot; {item.prompt.slice(0, 30)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Regenerate button */}
                      {onRegenerate && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRegenerate(item); }}
                          className="p-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-full"
                          style={{ color: "var(--text-tertiary)" }}
                          title="使用相同参数重新生成"
                        >
                          <Repeat size={12} />
                        </button>
                      )}
                      <span className="text-[10px] font-mono tracking-wider hidden sm:block"
                        style={{ color: "var(--text-tertiary)" }}>
                        {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, "0")}
                      </span>
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
