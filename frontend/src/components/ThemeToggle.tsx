"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-10 h-10" />;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative w-10 h-10 flex items-center justify-center transition-all duration-300 active:scale-95"
      style={{
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border-color)",
        borderRadius: 12,
      }}
      title={isDark ? "日间模式" : "夜间模式"}
    >
      <div className="absolute inset-2 rotate-45 rounded-sm"
        style={{ border: "1px solid var(--border-color)" }} />

      <div className="relative z-10">
        {isDark ? (
          <Sun size={16} weight="fill" style={{ color: "var(--accent)" }} />
        ) : (
          <Moon size={16} weight="fill" style={{ color: "var(--accent)" }} />
        )}
      </div>
    </button>
  );
}
