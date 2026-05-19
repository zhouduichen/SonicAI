"use client";

import { useState, useEffect } from "react";

const CYCLE_WORDS = ["沉浸的", "律动的", "空灵的", "温暖的", "澎湃的", "自由的"];
const CYCLE_INTERVAL = 2800;

export default function DynamicHeadline() {
  const [wordIndex, setWordIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Initial reveal
    const t = setTimeout(() => setIsVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % CYCLE_WORDS.length);
    }, CYCLE_INTERVAL);
    return () => clearInterval(interval);
  }, [isVisible]);

  return (
    <h1
      className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight leading-none text-center"
      style={{ fontFamily: "'Playfair Display', serif" }}
    >
      {/* Line 1: static */}
      <span
        className="block transition-all duration-1000"
        style={{
          color: "var(--text-primary)",
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "translateY(0)" : "translateY(16px)",
          filter: isVisible ? "blur(0)" : "blur(4px)",
          transitionDelay: "0ms",
        }}
      >
        用 AI 创造
      </span>

      {/* Line 2: cycling adjective + static ending */}
      <span className="block mt-2">
        {/* Cycling word with glow */}
        <span className="relative inline-block min-w-[2em]">
          {CYCLE_WORDS.map((word, i) => (
            <span
              key={word}
              className="transition-all duration-700 absolute left-0 whitespace-nowrap"
              style={{
                color: "var(--accent)",
                opacity: wordIndex === i ? 1 : 0,
                transform: wordIndex === i ? "translateY(0)" : (wordIndex > i || (wordIndex === 0 && i === CYCLE_WORDS.length - 1)) ? "translateY(-20px)" : "translateY(20px)",
                filter: wordIndex === i ? "blur(0)" : "blur(8px)",
                textShadow: wordIndex === i ? "0 0 40px rgba(212,168,83,0.3)" : "none",
                pointerEvents: "none",
              }}
            >
              {word}
            </span>
          ))}
          {/* Invisible placeholder to maintain layout width */}
          <span className="opacity-0 pointer-events-none">
            {CYCLE_WORDS.reduce((a, b) => a.length >= b.length ? a : b)}
          </span>
        </span>

        <span
          className="transition-all duration-1000 delay-200"
          style={{
            color: "var(--text-primary)",
            opacity: isVisible ? 1 : 0,
            filter: isVisible ? "blur(0)" : "blur(4px)",
          }}
        >
          {" "}音乐
        </span>
      </span>
    </h1>
  );
}
