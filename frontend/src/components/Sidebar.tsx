"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { House, WaveSine, Books, GridFour, Playlist, Gear, Disc } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import ThemeToggle from "./ThemeToggle";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSettingsClick: () => void;
}

const navItems = [
  { id: "create", label: "CREATE", sub: "创作台", icon: WaveSine },
  { id: "assets", label: "ASSETS", sub: "素材库", icon: Books },
  { id: "lab", label: "LAB", sub: "实验室", icon: GridFour },
  { id: "archive", label: "ARCHIVE", sub: "作品库", icon: Playlist },
];

export default function Sidebar({ activeTab, onTabChange, onSettingsClick }: SidebarProps) {
  const [backendRunning, setBackendRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/services");
        const data = await res.json();
        if (!cancelled) setBackendRunning(data.backend?.running ?? false);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const handleToggleBackend = useCallback(async () => {
    setToggling(true);
    setError(null);
    try {
      const action = backendRunning ? "stop" : "start";
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await res.json();
      if (!result.ok) {
        setError(result.message || `${action} 失败`);
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
      const pollRes = await fetch("/api/services");
      const pollData = await pollRes.json();
      setBackendRunning(pollData.backend?.running ?? false);
    } catch {
      setError("操作失败，请重试");
    } finally { setToggling(false); }
  }, [backendRunning]);

  return (
    <aside
      className="fixed left-0 top-0 h-full w-60 z-40 flex flex-col"
      style={{
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-color)",
      }}
    >
      {/* Logo */}
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, transparent, var(--accent))" }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ background: "var(--accent)" }} />
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to left, transparent, var(--accent))" }} />
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 flex items-center justify-center">
            <div className="absolute inset-0 rotate-45 rounded-sm"
              style={{ background: "var(--bg-tertiary)", border: "1.5px solid var(--accent)" }} />
            <Disc size={15} weight="fill" className="relative z-10" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-[0.08em] uppercase leading-none"
              style={{ color: "var(--accent)", fontFamily: "'Playfair Display', serif" }}>
              Sonic
            </h1>
            <p className="text-xs italic tracking-[0.06em] uppercase leading-none mt-0.5"
              style={{ color: "var(--text-tertiary)", fontFamily: "'Playfair Display', serif" }}>
              Audio Atelier
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, transparent, var(--accent))" }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ background: "var(--accent)" }} />
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to left, transparent, var(--accent))" }} />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-0.5 overflow-y-auto">
        <Link
          href="/"
          className="nav-item"
        >
          <House size={18} weight="regular" style={{ color: "var(--text-tertiary)" }} />
          <div className="text-left flex-1">
            <p className="text-[10px] font-mono tracking-[0.1em]" style={{ color: "var(--text-tertiary)" }}>HOME</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>首页</p>
          </div>
        </Link>

        <div className="py-2">
          <div className="h-px" style={{ background: "var(--border-color)" }} />
        </div>

        {navItems.map(({ id, label, sub, icon: Icon }, i) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              data-active={active}
              className="nav-item stagger-child"
              style={{ animationDelay: `${140 + i * 80}ms` }}
            >
              <Icon
                size={18}
                weight={active ? "fill" : "regular"}
                style={{
                  color: active ? "var(--accent)" : "var(--text-tertiary)",
                  transition: "color 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
                }}
              />
              <div className="text-left flex-1">
                <p className="text-[10px] font-mono tracking-[0.1em]"
                  style={{ color: active ? "var(--accent)" : "var(--text-tertiary)" }}>
                  {label}
                </p>
                <p className="text-xs mt-0.5"
                  style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {sub}
                </p>
              </div>

              {active && (
                <div className="w-1.5 h-1.5 rotate-45"
                  style={{ background: "var(--accent)" }} />
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-4 mt-2">
        <button onClick={onSettingsClick} className="nav-item">
          <Gear size={18} weight="regular" style={{ color: "var(--text-tertiary)" }} />
          <div className="text-left flex-1">
            <p className="text-[10px] font-mono tracking-[0.1em]" style={{ color: "var(--text-tertiary)" }}>SETTINGS</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>硬件设置</p>
          </div>
        </button>
      </div>

      {/* Backend Service Status */}
      <div className="px-4 py-2" style={{ borderTop: "1px solid var(--border-color)" }}>
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{
                background: toggling
                  ? "#e8a840"
                  : backendRunning
                    ? "#22c55e"
                    : "#666",
                boxShadow: toggling
                  ? "0 0 8px rgba(232,168,64,0.6)"
                  : backendRunning
                    ? "0 0 6px rgba(34,197,94,0.5)"
                    : "none",
                transition: "background 0.6s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.6s cubic-bezier(0.32, 0.72, 0, 1)",
                animation: toggling ? "pulse 1s ease-in-out infinite" : "none",
              }}
            />
            <div>
              <p className="text-[9px] font-mono tracking-[0.1em]" style={{ color: "var(--text-tertiary)" }}>
                BACKEND
              </p>
              <p className="text-xs mt-0.5 transition-colors duration-500"
                style={{ color: toggling ? "#e8a840" : backendRunning ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                {toggling ? (backendRunning ? "停止中..." : "连接中...") : backendRunning ? "运行中" : "已停止"}
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleBackend}
            disabled={toggling}
            className="text-[9px] font-mono px-3 py-1 rounded-full transition-all duration-200"
            style={{
              background: backendRunning ? "var(--bg-tertiary)" : "var(--accent)",
              color: backendRunning ? "var(--text-secondary)" : "#0d0d0d",
              opacity: toggling ? 0.5 : 1,
              cursor: toggling ? "not-allowed" : "pointer",
              border: "none",
            }}
          >
            {toggling ? "..." : backendRunning ? "Stop" : "Start"}
          </button>
        </div>
        {error && (
          <p className="text-[9px] px-3 pb-1" style={{ color: "#e8a840" }}>
            {error}
          </p>
        )}
      </div>

      {/* Bottom */}
      <div className="p-4" style={{ borderTop: "1px solid var(--border-color)" }}>
        <div className="flex items-center justify-between px-3 py-2">
          <div>
            <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              音乐创作者
            </p>
            <p className="text-[10px] font-mono tracking-widest" style={{ color: "var(--text-tertiary)" }}>
              AI MUSIC STUDIO
            </p>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex justify-center mt-3">
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-1 h-1 rotate-45"
                style={{ background: "var(--accent)", opacity: 0.3 + i * 0.2 }} />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
