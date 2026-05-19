"use client";

function rng(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const TOTAL = 180;

interface Dot {
  x: number;
  y: number;
  size: number;
  glow: number;
  speed: number;
  delay: number;
  driftX: number;
  driftY: number;
}

const DOTS: Dot[] = [];

for (let i = 0; i < TOTAL; i++) {
  const r1 = rng(i * 7 + 1);
  const r2 = rng(i * 13 + 3);
  const r3 = rng(i * 19 + 5);
  const r4 = rng(i * 29 + 7);
  const r5 = rng(i * 37 + 9);

  // Larger particles concentrated lower (bass region)
  const isLarge = r1 > 0.88;
  const isMid = !isLarge && r1 > 0.7;
  const isBeat = r1 > 0.95;

  DOTS.push({
    x: r2 * 100,
    y: isLarge ? 55 + r3 * 40 : isMid ? 30 + r3 * 55 : r3 * 85,
    size: isBeat ? 4 + r4 * 3 : isLarge ? 2 + r4 * 3 : isMid ? 1 + r4 * 2 : 0.6 + r4 * 1.2,
    glow: isBeat ? 18 + r5 * 20 : isLarge ? 8 + r5 * 12 : isMid ? 3 + r5 * 6 : 0,
    speed: isLarge ? 4 + r5 * 6 : isMid ? 5 + r5 * 8 : 6 + r5 * 10,
    delay: r3 * 8,
    driftX: (r4 - 0.5) * 24,
    driftY: isLarge ? -(8 + r5 * 18) : isMid ? -(4 + r5 * 14) : -(2 + r5 * 12),
  });
}

export default function MassiveWaveBackground() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Base ambient glow zones */}
      <div className="absolute bottom-0 left-1/4 w-1/2 h-2/3 rounded-full"
        style={{
          background: "radial-gradient(ellipse at bottom, rgba(212,168,83,0.03) 0%, transparent 70%)",
          animation: "ambient-drift 20s ease-in-out infinite",
        }} />
      <div className="absolute top-1/3 left-0 w-1/3 h-1/3 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(212,168,83,0.02) 0%, transparent 70%)",
          animation: "ambient-drift 18s ease-in-out 3s infinite reverse",
        }} />
      <div className="absolute top-1/4 right-0 w-1/4 h-1/2 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(232,194,103,0.015) 0%, transparent 70%)",
          animation: "ambient-drift 22s ease-in-out 5s infinite",
        }} />

      {/* Particle field */}
      {DOTS.map((d, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.size,
            height: d.size,
            background: d.glow > 0 ? "var(--accent-glow)" : "var(--accent)",
            opacity: d.glow > 0 ? 0.5 : 0.15,
            boxShadow: d.glow > 0 ? `0 0 ${d.glow}px rgba(232,194,103,0.5), 0 0 ${d.glow * 2}px rgba(212,168,83,0.2)` : "none",
            "--dx": `${d.driftX}px`,
            "--dy": `${d.driftY}px`,
            animation: `particle-drift ${d.speed}s ease-in-out ${d.delay}s infinite`,
            willChange: d.glow > 6 ? "transform, opacity" : "auto",
          } as React.CSSProperties}
        />
      ))}

      {/* Top fade for content readability */}
      <div className="absolute top-0 left-0 right-0 h-64"
        style={{ background: "linear-gradient(to bottom, var(--bg-primary) 0%, transparent 100%)" }} />
      <div className="absolute bottom-0 left-0 right-0 h-20"
        style={{ background: "linear-gradient(to top, var(--bg-primary) 0%, transparent 100%)" }} />
    </div>
  );
}
