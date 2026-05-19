"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Sparkle, Shuffle, Play, Disc, WaveSine } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import AudioVisualBackground from "./AudioVisualBackground";
import DynamicHeadline from "./DynamicHeadline";

const QUICK_TAGS = ["Lo-Fi 午后", "电子氛围", "爵士钢琴", "嘻哈节奏", "自然白噪音", "复古合成器"];

export default function HeroSection() {
  const [prompt, setPrompt] = useState("");
  const router = useRouter();

  const handleSubmit = () => {
    const target = prompt.trim()
      ? `/create?prompt=${encodeURIComponent(prompt.trim())}`
      : "/create";
    router.push(target);
  };

  return (
    <section className="relative min-h-[100dvh] flex flex-col items-center justify-center px-6 py-24 overflow-hidden">
      {/* Ambient orbs */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute -top-1/4 -left-1/4 w-[700px] h-[700px] rounded-full"
          style={{ background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)", opacity: 0.05, animation: "ambient-drift 24s ease-in-out infinite" }} />
        <div className="absolute top-1/2 -right-1/4 w-[500px] h-[500px] rounded-full"
          style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)", opacity: 0.03, animation: "ambient-drift 28s ease-in-out infinite reverse" }} />
      </div>

      {/* Audio visual background */}
      <AudioVisualBackground />

      {/* Content */}
      <div className="relative z-10 max-w-3xl mx-auto text-center space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
        >
          <span className="eyebrow">AI MUSIC STUDIO</span>
        </motion.div>

        <DynamicHeadline />

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-lg max-w-xl mx-auto leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          上传音频，AI 提取风格特征。用文字描述你想要的音乐，即刻生成。
        </motion.p>

        {/* CTA input */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="max-w-xl mx-auto"
        >
          <div className="flex items-center gap-3 p-2 pr-2 rounded-full"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", boxShadow: "var(--shadow-elevated)" }}>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="描述你脑海中的旋律..."
              className="flex-1 bg-transparent px-4 py-3 text-sm outline-none"
              style={{ color: "var(--text-primary)" }}
            />
            <button onClick={handleSubmit} className="btn-primary text-sm shrink-0">
              <Sparkle size={16} weight="fill" />
              <span>开始创作</span>
              <span className="btn-icon-wrap">
                <ArrowRight size={16} weight="bold" />
              </span>
            </button>
          </div>
        </motion.div>

        {/* Quick tags */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="flex items-center justify-center gap-2 flex-wrap"
        >
          {QUICK_TAGS.map((tag) => (
            <button key={tag} onClick={() => setPrompt(tag)} className="btn-ghost text-xs">
              {tag}
            </button>
          ))}
        </motion.div>

        {/* Two CTA buttons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.6 }}
          className="flex items-center justify-center gap-4 pt-4"
        >
          <Link href="/create" className="btn-primary text-sm">
            <WaveSine size={16} weight="fill" />
            <span>进入创作台</span>
            <span className="btn-icon-wrap">
              <ArrowRight size={16} weight="bold" />
            </span>
          </Link>
          <button
            onClick={() => {
              const el = document.getElementById("featured-tracks");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            className="btn-ghost text-sm"
          >
            <Disc size={16} weight="regular" />
            <span>探索精选</span>
          </button>
        </motion.div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none z-10"
        style={{ background: "linear-gradient(to top, var(--bg-primary), transparent)" }} />
    </section>
  );
}
