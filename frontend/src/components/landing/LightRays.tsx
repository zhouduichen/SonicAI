"use client";

import { useEffect, useRef } from "react";

export default function LightRays() {
  const raysRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = raysRef.current;
    if (!el) return;

    let raf: number;
    const handleMove = (e: MouseEvent) => {
      raf = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth) * 100;
        const y = (e.clientY / window.innerHeight) * 100;
        el.style.setProperty("--mx", `${x}%`);
        el.style.setProperty("--my", `${y}%`);
      });
    };

    window.addEventListener("mousemove", handleMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={raysRef} className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Main diagonal light beam — top left */}
      <div className="absolute -top-1/4 -left-1/4 w-[120%] h-[80%]"
        style={{
          background: "linear-gradient(105deg, transparent 30%, rgba(212,168,83,0.02) 45%, rgba(232,194,103,0.04) 50%, rgba(212,168,83,0.02) 55%, transparent 70%)",
          transform: "rotate(-12deg)",
          animation: "light-ray-drift 12s ease-in-out infinite",
        }} />

      {/* Secondary beam — top right */}
      <div className="absolute -top-1/3 -right-1/4 w-[100%] h-[60%]"
        style={{
          background: "linear-gradient(115deg, transparent 35%, rgba(212,168,83,0.015) 48%, rgba(232,194,103,0.03) 52%, rgba(212,168,83,0.015) 56%, transparent 65%)",
          transform: "rotate(8deg)",
          animation: "light-ray-drift 15s ease-in-out 2s infinite reverse",
        }} />

      {/* Bottom warm wash */}
      <div className="absolute -bottom-1/3 left-1/4 w-[60%] h-[50%] rounded-full"
        style={{
          background: "radial-gradient(ellipse at center, rgba(212,168,83,0.03) 0%, transparent 70%)",
          animation: "ambient-drift 20s ease-in-out infinite",
        }} />

      {/* Subtle mouse-following highlight */}
      <div className="absolute inset-0"
        style={{
          background: "radial-gradient(circle 400px at var(--mx, 50%) var(--my, 50%), rgba(212,168,83,0.03) 0%, transparent 70%)",
          transition: "background 0.8s ease-out",
        }} />
    </div>
  );
}
