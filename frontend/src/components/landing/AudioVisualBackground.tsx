"use client";

const BAR_COUNT = 28;
const FLOATING_NOTES = 16;

function seededUnit(seed: number) {
  let value = (seed + 0x6d2b79f5) | 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function cssNumber(value: number) {
  return Number(value.toFixed(3)).toString();
}

function makeBars(count: number, seed: number) {
  return Array.from({ length: count }, (_, i) => {
    const r = seededUnit(seed * 1000 + i);
    return {
      height: 10 + r * 75,
      duration: 0.5 + r * 1.5,
      delay: r * 2,
    };
  });
}

const leftBars = makeBars(BAR_COUNT, 1);
const rightBars = makeBars(BAR_COUNT, 2);
const notes = makeBars(FLOATING_NOTES, 3);

export default function AudioVisualBackground() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Left EQ */}
      <div className="absolute left-4 bottom-1/4 flex items-end gap-[2px] opacity-[0.14]">
        {leftBars.map((b, i) => (
          <div key={`l-${i}`} className="w-[4px] rounded-t-sm" style={{
            height: `${cssNumber(b.height)}px`,
            background: `linear-gradient(to top, var(--accent), var(--accent-glow))`,
            animation: `eq-pulse ${cssNumber(b.duration)}s ease-in-out ${cssNumber(b.delay)}s infinite`,
            boxShadow: "0 0 6px rgba(212,168,83,0.3)",
          }} />
        ))}
      </div>

      {/* Right EQ */}
      <div className="absolute right-4 top-1/4 flex items-end gap-[2px] opacity-[0.12] scale-x-[-1]">
        {rightBars.map((b, i) => (
          <div key={`r-${i}`} className="w-[4px] rounded-t-sm" style={{
            height: `${cssNumber(b.height)}px`,
            background: `linear-gradient(to top, var(--accent), var(--accent-glow))`,
            animation: `eq-pulse ${cssNumber(b.duration)}s ease-in-out ${cssNumber(b.delay)}s infinite`,
            boxShadow: "0 0 6px rgba(212,168,83,0.3)",
          }} />
        ))}
      </div>

      {/* Frequency rings */}
      {[1, 2, 3].map((ring) => (
        <div key={`ring-${ring}`} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            width: `${ring * 200}px`, height: `${ring * 200}px`,
            borderColor: "var(--accent)",
            opacity: 0.06 / ring,
            boxShadow: `0 0 ${ring * 10}px rgba(212,168,83,0.05)`,
            animation: `ring-expand ${4 + ring * 2}s ease-out ${ring * 0.8}s infinite`,
          }} />
      ))}

      {/* Floating diamond notes */}
      {notes.map((n, i) => (
        <div key={`note-${i}`} className="absolute w-2 h-2 rotate-45"
          style={{
            left: `${(i / FLOATING_NOTES) * 100}%`,
            top: `${cssNumber(20 + n.delay * 60)}%`,
            background: "var(--accent)",
            opacity: 0.1,
            boxShadow: "0 0 4px rgba(212,168,83,0.4)",
            animation: `note-float ${cssNumber(5 + n.delay * 8)}s ease-in-out ${cssNumber(n.delay * 4)}s infinite`,
          }} />
      ))}
    </div>
  );
}
