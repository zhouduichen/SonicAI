"use client";

import { motion } from "framer-motion";
import { Upload, WaveSine, MusicNotes } from "@phosphor-icons/react";

const STEPS = [
  { number: "01", icon: Upload, title: "上传音频", desc: "拖拽你喜欢的音频文件，AI 自动分析旋律、节奏与音色，提取音乐风格特征。" },
  { number: "02", icon: WaveSine, title: "选择风格", desc: "从自动提取的风格标签库中选择一个，AI 以此为参考理解你的音乐品味。" },
  { number: "03", icon: MusicNotes, title: "生成音乐", desc: "用文字描述你想要的音乐感觉，AI 结合风格与描述，瞬间生成专属作品。" },
];

export default function HowItWorks() {
  return (
    <section className="relative py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16 space-y-4">
          <span className="eyebrow">HOW IT WORKS</span>
          <h2 className="text-3xl md:text-4xl italic font-medium"
            style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
            三步创作你的音乐
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="text-center relative"
              >
                {/* Step number */}
                <p className="text-[60px] font-bold leading-none mb-4 tracking-tighter"
                  style={{ color: "var(--accent)", opacity: 0.08, fontFamily: "'Playfair Display', serif" }}>
                  {step.number}
                </p>

                {/* Icon with beat animation */}
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center relative -mt-8"
                  style={{
                    background: "var(--accent-soft)",
                    border: "1px solid rgba(212, 168, 83, 0.2)",
                    animation: `beat-pulse ${3 + i * 0.5}s ease-in-out ${i * 0.3}s infinite`,
                  }}>
                  <Icon size={26} weight="regular" style={{ color: "var(--accent)" }} aria-hidden="true" />
                </div>

                {/* Title */}
                <h3 className="text-base font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: "var(--text-secondary)" }}>
                  {step.desc}
                </p>

                {/* Mini EQ bar */}
                <div className="flex items-end justify-center gap-[2px] h-3 mt-5 opacity-30">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <div key={j} className="w-[2px] rounded-full"
                      style={{
                        height: `${3 + (j % 3) * 5}px`,
                        background: "var(--accent)",
                        animation: `eq-pulse ${0.4 + j * 0.12}s ease-in-out ${j * 0.08}s infinite`,
                      }} />
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
