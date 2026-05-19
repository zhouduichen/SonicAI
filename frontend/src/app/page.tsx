"use client";

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import HeroSection from "@/components/landing/HeroSection";
import FeaturedTracks from "@/components/landing/FeaturedTracks";
import HowItWorks from "@/components/landing/HowItWorks";
import MusicDivider from "@/components/landing/MusicDivider";
import LightRays from "@/components/landing/LightRays";
import MassiveWaveBackground from "@/components/landing/MassiveWaveBackground";

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh]">
      <LightRays />
      <MassiveWaveBackground />
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rotate-45 rounded-sm flex items-center justify-center"
              style={{ background: "var(--accent)", opacity: 0.15, border: "1px solid var(--accent)" }}>
              <div className="w-2 h-2 -rotate-45 rounded-full" style={{ background: "var(--accent)" }} />
            </div>
            <span className="text-sm font-bold tracking-[0.08em] uppercase"
              style={{ color: "var(--accent)", fontFamily: "'Playfair Display', serif" }}>
              SonicAI
            </span>
          </Link>
          <Link href="/create" className="btn-primary text-xs">
            <span>打开创作台</span>
            <span className="btn-icon-wrap">
              <ArrowRight size={14} weight="bold" />
            </span>
          </Link>
        </div>
      </header>

      <HeroSection />
      <MusicDivider />
      <FeaturedTracks />
      <MusicDivider />
      <HowItWorks />

      <footer className="py-16 px-6 text-center" style={{ borderTop: "1px solid var(--border-color)" }}>
        <p className="text-xs font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          SONICAI &middot; AI MUSIC STUDIO &middot; 2026
        </p>
      </footer>
    </div>
  );
}
