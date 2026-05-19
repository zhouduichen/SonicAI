"use client";

import { cn } from "@/lib/utils";

export default function WaveformBars({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-end gap-[2px] h-5", className)}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="wave-bar w-[3px] animate-waveform"
          style={{
            background: "var(--accent)",
          }}
        />
      ))}
    </div>
  );
}
