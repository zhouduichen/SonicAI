"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CaretDown, CheckCircle, Cpu } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import type { ModelInfo } from "@/types";

interface ModelSelectorProps {
  label: string;
  options: ModelInfo[];
  selected: string;
  onChange: (key: string) => void;
  disabled?: boolean;
  icon?: ReactNode;
}

function ProConItem({ text, kind }: { text: string; kind: "pro" | "con" }) {
  return (
    <div
      className="flex items-start gap-1.5 text-[11px] leading-snug"
      style={{ color: kind === "pro" ? "var(--accent)" : "var(--text-tertiary)" }}
      aria-hidden="true"
    >
      <span className="mt-[3px] flex-shrink-0">
        {kind === "pro" ? (
          <span
            className="block w-2 h-2 rotate-45 flex-shrink-0"
            style={{ background: "var(--accent)", opacity: 0.7 }}
          />
        ) : (
          <span
            className="block w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: "var(--text-tertiary)", opacity: 0.6 }}
          />
        )}
      </span>
      <span>{text}</span>
    </div>
  );
}

export default function ModelSelector({
  label,
  options,
  selected,
  onChange,
  disabled,
  icon,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{
    left: number;
    top: number;
    width: number;
  }>({ left: 0, top: 0, width: 340 });

  const computeRect = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const maxH = window.innerHeight;
    const desiredWidth = Math.max(r.width, 340);
    const left = Math.min(r.left, vw - desiredWidth - 12);
    // Prefer below, flip above if not enough room
    const spaceBelow = maxH - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const preferAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
    setDropdownRect({
      left: Math.max(left, 4),
      top: preferAbove ? r.top - 8 : r.bottom + 6,
      width: desiredWidth,
    });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideTrigger && !insideDropdown) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Reposition on scroll / resize while open
  useEffect(() => {
    if (!open) return;
    computeRect();
    window.addEventListener("resize", computeRect);
    window.addEventListener("scroll", computeRect, true);
    return () => {
      window.removeEventListener("resize", computeRect);
      window.removeEventListener("scroll", computeRect, true);
    };
  }, [open, computeRect]);

  const handleToggle = () => {
    if (disabled) return;
    if (!open) computeRect();
    setOpen(!open);
  };

  const current = options.find((m) => m.key === selected);
  const displayName = current?.display_name || selected;

  const dropdown = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={dropdownRef}
          role="listbox"
          aria-label={label}
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          style={{
            position: "fixed",
            left: dropdownRect.left,
            top: dropdownRect.top,
            width: dropdownRect.width,
            maxHeight: "min(70vh, 600px)",
            overflowY: "auto",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-light)",
            borderRadius: 14,
            boxShadow: "var(--shadow-overlay)",
            padding: 6,
            zIndex: 9999,
          }}
        >
          {options.map((model) => {
            const active = model.key === selected;
            return (
              <div
                key={model.key}
                role="option"
                aria-selected={active}
                tabIndex={0}
                onClick={() => {
                  onChange(model.key);
                  setOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onChange(model.key);
                    setOpen(false);
                  }
                }}
                className="w-full text-left transition-all duration-200 cursor-pointer focus-visible:outline-none"
                style={{
                  background: active ? "var(--accent-soft)" : "transparent",
                  border: active
                    ? "1px solid var(--accent)"
                    : "1px solid transparent",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 4,
                  outline: "none",
                }}
              >
                {/* Header row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {active && (
                      <CheckCircle
                        size={14}
                        weight="fill"
                        style={{ color: "var(--accent)", flexShrink: 0 }}
                      />
                    )}
                    <span
                      className="text-sm font-semibold truncate"
                      style={{
                        color: active ? "var(--accent)" : "var(--text-primary)",
                      }}
                    >
                      {model.display_name}
                    </span>
                  </div>
                  <span
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      background: active ? "rgba(212,168,83,0.15)" : "var(--bg-tertiary)",
                      color: active ? "var(--accent)" : "var(--text-tertiary)",
                    }}
                  >
                    {model.vram_gb}GB
                  </span>
                </div>

                {/* Description */}
                <p
                  className="text-[11px] mt-1.5 leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {model.description}
                </p>

                {/* Metrics row */}
                <div className="flex items-center gap-3 mt-1.5">
                  <span
                    className="text-[10px] font-mono tracking-[0.08em] uppercase"
                    style={{ color: "var(--accent)", opacity: 0.8 }}
                  >
                    {model.quality}
                  </span>
                  <span
                    className="text-[10px] font-mono tracking-[0.08em] uppercase"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {model.speed}
                  </span>
                  {model.embedding_dim && (
                    <span
                      className="text-[10px] font-mono tracking-[0.08em] uppercase"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {model.embedding_dim}D
                    </span>
                  )}
                </div>

                {/* Pros & Cons */}
                {(model.pros.length > 0 || model.cons.length > 0) && (
                  <div
                    className="grid grid-cols-1 gap-2 mt-2 pt-2"
                    style={{ borderTop: "1px solid var(--border-light)" }}
                  >
                    {model.pros.length > 0 && (
                      <div className="space-y-0.5">
                        {model.pros.map((p, i) => (
                          <ProConItem key={`pro-${i}`} text={p} kind="pro" />
                        ))}
                      </div>
                    )}
                    {model.cons.length > 0 && (
                      <div className="space-y-0.5">
                        {model.cons.map((c, i) => (
                          <ProConItem key={`con-${i}`} text={c} kind="con" />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Label */}
      <div className="flex items-center gap-2 mb-1.5">
        {icon || <Cpu size={14} style={{ color: "var(--text-tertiary)" }} />}
        <span
          className="text-[10px] font-mono tracking-[0.1em] uppercase"
          style={{ color: "var(--text-tertiary)" }}
        >
          {label}
        </span>
      </div>

      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="w-full flex items-center gap-2 px-3 py-2 transition-all duration-200"
        style={{
          background: "var(--bg-tertiary)",
          border: open ? "1px solid var(--accent)" : "1px solid var(--border-color)",
          borderRadius: 8,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span
          className="flex-1 text-left text-sm font-medium truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {displayName}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <CaretDown size={12} style={{ color: "var(--text-tertiary)" }} />
        </motion.div>
      </button>

      {/* Current model summary (collapsed) */}
      {current && !open && (current.pros.length > 0 || current.cons.length > 0) && (
        <div className="flex items-center gap-2 mt-1 px-1">
          <span
            className="text-[10px] font-mono tracking-[0.08em] uppercase"
            style={{ color: "var(--accent)", opacity: 0.7 }}
          >
            {current.quality}
          </span>
          <span
            className="text-[10px] font-mono tracking-[0.08em] uppercase"
            style={{ color: "var(--text-tertiary)" }}
          >
            {current.speed} · {current.vram_gb}GB
          </span>
        </div>
      )}

      {/* Portal-rendered dropdown — escapes all overflow-hidden ancestors */}
      {typeof window !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  );
}
