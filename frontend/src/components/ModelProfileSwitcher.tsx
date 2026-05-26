"use client";

import type { HardwareTier, PreferenceMode } from "@/types";
import { getTierConfig, PREFERENCE_LABELS } from "@/lib/hardware-tiers";

interface ModelProfileSwitcherProps {
  tier: HardwareTier;
  preference: PreferenceMode;
  onChange: (mode: PreferenceMode) => void;
}

const PROFILE_ORDER: PreferenceMode[] = ["speed", "balanced", "quality"];

export default function ModelProfileSwitcher({ tier, preference, onChange }: ModelProfileSwitcherProps) {
  const config = getTierConfig(tier);

  return (
    <div className="flex gap-2">
      {PROFILE_ORDER.map((mode) => {
        const preset = config.presets[mode];
        const info = PREFERENCE_LABELS[mode];
        const active = preference === mode;

        return (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            className="flex-1 px-4 py-3 rounded-xl text-left transition-all duration-300"
            style={{
              background: active ? "var(--accent-soft)" : "var(--bg-primary)",
              border: active
                ? "1.5px solid var(--accent)"
                : "1px solid var(--border-color)",
              opacity: active ? 1 : 0.7,
            }}
          >
            {/* Label row */}
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="text-sm"
                style={{ color: active ? "var(--accent)" : "var(--text-secondary)" }}
              >
                {info.icon}
              </span>
              <span
                className="text-xs font-semibold tracking-wide"
                style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}
              >
                {info.label}
              </span>
              {active && (
                <span
                  className="ml-auto w-2 h-2 rounded-full"
                  style={{ background: "var(--accent)" }}
                />
              )}
            </div>

            {/* Sub label */}
            <p
              className="text-[9px] font-mono tracking-wider mb-2"
              style={{ color: "var(--text-tertiary)" }}
            >
              {info.sub}
            </p>

            {/* Model preview tags */}
            {preset && (
              <div className="flex flex-wrap gap-1">
                <span
                  className="text-[7px] font-mono px-1 py-0.5 rounded"
                  style={{
                    background: active ? "rgba(212,168,83,0.12)" : "var(--bg-tertiary)",
                    color: "var(--text-tertiary)",
                  }}
                >
                  {modelShortName(preset.musicGenModel)}
                </span>
                <span
                  className="text-[7px] font-mono px-1 py-0.5 rounded"
                  style={{
                    background: active ? "rgba(212,168,83,0.12)" : "var(--bg-tertiary)",
                    color: "var(--text-tertiary)",
                  }}
                >
                  {modelShortName(preset.styleExtractModel)}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function modelShortName(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/musicgen/g, "mg")
    .replace(/spleeter/g, "spl")
    .replace(/demucs/g, "dmx")
    .replace(/clap/g, "clap")
    .replace(/encodec/g, "enc")
    .replace(/htdemucs/g, "ht")
    .replace(/mdx_extra/g, "mdx+")
    .replace(/msclap/g, "ms")
    .replace(/laion/g, "ln")
    .replace(/6kbps/g, "6k")
    .replace(/_?small/g, "S")
    .replace(/_?medium/g, "M")
    .replace(/_?melody/g, "Mel")
    .replace(/_?large/g, "L");
}
