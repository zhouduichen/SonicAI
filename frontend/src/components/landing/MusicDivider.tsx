export default function MusicDivider() {
  return (
    <div className="relative py-8 overflow-hidden">
      {/* Animated waveform bars */}
      <div className="flex items-end justify-center gap-[2px] h-12 opacity-[0.12]">
        {Array.from({ length: 64 }).map((_, i) => {
          const baseHeight = 8 + Math.abs(Math.sin(i * 0.18)) * 36;
          const duration = 0.7 + Math.abs(Math.sin(i * 0.37)) * 1.6;
          const delay = Math.abs(Math.cos(i * 0.23)) * 1.2;
          return (
            <div
              key={i}
              className="w-[2px] rounded-full"
              style={{
                height: `${baseHeight}px`,
                background: "var(--accent)",
                animation: `eq-pulse ${duration}s ease-in-out ${delay}s infinite`,
              }}
            />
          );
        })}
      </div>

      {/* Center accent diamond */}
      <div className="flex items-center justify-center gap-3 my-3">
        <div className="flex-1 h-px max-w-32"
          style={{ background: "linear-gradient(to right, transparent, var(--accent))", opacity: 0.3 }} />
        <div className="w-2 h-2 rotate-45"
          style={{ background: "var(--accent)", opacity: 0.6, animation: "beat-pulse 2s ease-in-out infinite" }} />
        <div className="flex-1 h-px max-w-32"
          style={{ background: "linear-gradient(to left, transparent, var(--accent))", opacity: 0.3 }} />
      </div>
    </div>
  );
}
